// Fake Prisma engine: a small in-memory implementation of the Prisma client surface that the Studio/Builder path
// uses. It is deliberately STRICT: anything it does not implement (model, method, argument, operator, SQL) throws
// a FakePrismaError with code FAKE_UNSUPPORTED instead of quietly returning empty data.
//
// Nothing in this directory imports the Prisma runtime or the real client class.
import { randomBytes } from "node:crypto";
import { ENUMS, MODELS } from "./models.mjs";

export class FakePrismaError extends Error {
  constructor(message, code = "FAKE_ERROR") {
    super(message);
    this.name = "FakePrismaError";
    this.code = code;
  }
}
const unsupported = (what) => new FakePrismaError(`[fake-prisma] unsupported: ${what}`, "FAKE_UNSUPPORTED");
const fail = (code, message) => new FakePrismaError(`[fake-prisma] ${message}`, code);

// ------------------------------------------------------------------ schema registry
function parseSpec(name, spec) {
  const m = /^(enum:\w+|\w+)(\?)?(?:=(.*))?$/.exec(spec);
  if (!m) throw new Error(`bad field spec ${name}: ${spec}`);
  const [, type, opt, def] = m;
  const out = { name, type, optional: Boolean(opt), hasDefault: def !== undefined, def };
  if (type.startsWith("enum:")) { out.type = "enum"; out.enum = type.slice(5); if (!ENUMS[out.enum]) throw new Error(`unknown enum ${out.enum}`); }
  return out;
}
const REG = {};
for (const [mname, def] of Object.entries(MODELS)) {
  const fields = {};
  for (const [f, spec] of Object.entries(def.fields)) fields[f] = parseSpec(f, spec);
  const unique = [[def.pk], ...(def.unique ?? [])];
  REG[mname] = { name: mname, pk: def.pk, fields, unique, relations: def.relations ?? {}, accessor: mname[0].toLowerCase() + mname.slice(1) };
}
for (const m of Object.values(REG)) for (const [r, rel] of Object.entries(m.relations)) {
  if (!REG[rel.to]) throw new Error(`${m.name}.${r} points at unknown model ${rel.to}`);
  if (!REG[rel.kind === "one" ? m.name : rel.to].fields[rel.fk]) throw new Error(`${m.name}.${r}: missing fk field ${rel.fk}`);
}
export const SUPPORTED_MODELS = Object.keys(REG);

// ------------------------------------------------------------------ database
export function createDb() {
  const tables = {};
  for (const m of SUPPORTED_MODELS) tables[m] = [];
  return { tables, txChain: null, ready: Promise.resolve(), counter: 0 };
}
const snapshot = (db) => Object.fromEntries(Object.entries(db.tables).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
const restore = (db, snap) => { for (const k of Object.keys(db.tables)) db.tables[k] = snap[k]; };

let idCounter = 0;
const cuid = () => `c${Date.now().toString(36)}${(idCounter++).toString(36)}${randomBytes(6).toString("hex")}`;

// ------------------------------------------------------------------ value handling
const isNullMarker = (v) => v !== null && typeof v === "object" && ["DbNull", "JsonNull", "AnyNull"].includes(v.constructor?.name);
const cloneRowValue = (v) => (v instanceof Date ? new Date(v.getTime()) : v);
const jsonClone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

function coerce(model, spec, value) {
  const where = `${model.name}.${spec.name}`;
  if (isNullMarker(value)) value = null; // Prisma.DbNull / JsonNull / AnyNull (matched by class name: the runtime is never imported)
  if (value === null) {
    if (!spec.optional) throw fail("P2011", `null value for required field ${where}`);
    return null;
  }
  switch (spec.type) {
    case "string": if (typeof value !== "string") throw fail("P2009", `${where} expects a string`); return value;
    case "int": if (!Number.isInteger(value)) throw fail("P2009", `${where} expects an integer`); return value;
    case "float": if (typeof value !== "number" || !Number.isFinite(value)) throw fail("P2009", `${where} expects a number`); return value;
    case "bool": if (typeof value !== "boolean") throw fail("P2009", `${where} expects a boolean`); return value;
    case "date": { const d = value instanceof Date ? new Date(value.getTime()) : new Date(value); if (Number.isNaN(d.getTime())) throw fail("P2009", `${where} expects a date`); return d; }
    case "json": return jsonClone(value);
    case "bytes": if (!(value instanceof Uint8Array)) throw fail("P2009", `${where} expects bytes`); return Buffer.from(value);
    case "enum": if (!ENUMS[spec.enum].includes(value)) throw fail("P2009", `${where}: invalid ${spec.enum} value ${JSON.stringify(value)}`); return value;
    default: throw unsupported(`field type ${spec.type}`);
  }
}
const isPlainObject = (v) => v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;

function defaultFor(spec) {
  if (spec.optional && !spec.hasDefault) return null;
  const d = spec.def;
  if (d === undefined) return undefined; // required, no default
  if (d === "cuid") return cuid();
  if (d === "now" || d === "updatedAt") return new Date();
  if (spec.type === "int" || spec.type === "float") return Number(d);
  if (spec.type === "bool") return d === "true";
  return d;
}

const eq = (a, b) => {
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (a instanceof Uint8Array && b instanceof Uint8Array) return Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
  return a === b;
};
const cmp = (a, b) => {
  const x = a instanceof Date ? a.getTime() : a, y = b instanceof Date ? b.getTime() : b;
  return x < y ? -1 : x > y ? 1 : 0;
};

// ------------------------------------------------------------------ where
function uniqueName(fields) { return fields.join("_"); }
function expandCompound(model, key) {
  for (const u of model.unique) if (u.length > 1 && uniqueName(u) === key) return u;
  return null;
}

function relatedRows(db, model, rel, row) {
  const target = db.tables[rel.to];
  if (rel.kind === "one") { const v = row[rel.fk]; return v == null ? [] : target.filter((t) => t[REG[rel.to].pk] === v); }
  return target.filter((t) => t[rel.fk] === row[model.pk]);
}

function scalarMatches(model, spec, rowVal, cond) {
  const where = `${model.name}.${spec.name}`;
  if (cond === null) return rowVal === null;
  if (isPlainObject(cond)) {
    if (spec.type === "json") throw unsupported(`JSON filter on ${where}`);
    for (const [op, arg] of Object.entries(cond)) {
      if (arg === undefined) continue;
      switch (op) {
        case "equals": if (!(arg === null ? rowVal === null : rowVal !== null && eq(rowVal, arg))) return false; break;
        // SQL semantics: `col <> x` never matches NULL, so `not` (like notIn) excludes NULL rows unless the argument is null.
        case "not": {
          const hit = isPlainObject(arg) ? rowVal !== null && !scalarMatches(model, spec, rowVal, arg) : arg === null ? rowVal !== null : rowVal !== null && !eq(rowVal, arg);
          if (!hit) return false;
          break;
        }
        case "in": if (!Array.isArray(arg)) throw unsupported(`${where} in: non-array`); if (!arg.some((a) => rowVal !== null && eq(rowVal, a))) return false; break;
        case "notIn": if (!Array.isArray(arg)) throw unsupported(`${where} notIn: non-array`); if (rowVal === null || arg.some((a) => eq(rowVal, a))) return false; break;
        case "lt": if (rowVal === null || !(cmp(rowVal, arg) < 0)) return false; break;
        case "lte": if (rowVal === null || !(cmp(rowVal, arg) <= 0)) return false; break;
        case "gt": if (rowVal === null || !(cmp(rowVal, arg) > 0)) return false; break;
        case "gte": if (rowVal === null || !(cmp(rowVal, arg) >= 0)) return false; break;
        case "contains": case "startsWith": case "endsWith":
          if (spec.type !== "string") throw unsupported(`${op} on non-string ${where}`);
          if (rowVal === null || !(op === "contains" ? rowVal.includes(arg) : op === "startsWith" ? rowVal.startsWith(arg) : rowVal.endsWith(arg))) return false; break;
        default: throw unsupported(`operator "${op}" on ${where}`);
      }
    }
    return true;
  }
  if (spec.type === "json") throw unsupported(`JSON equality filter on ${where}`);
  return rowVal !== null && eq(rowVal, cond);
}

function matchWhere(db, model, row, where) {
  if (where === undefined || where === null) return true;
  if (!isPlainObject(where)) throw unsupported(`where must be an object (${model.name})`);
  for (const [key, val] of Object.entries(where)) {
    if (val === undefined) continue;
    if (key === "AND") { const list = Array.isArray(val) ? val : [val]; if (!list.every((w) => matchWhere(db, model, row, w))) return false; continue; }
    if (key === "OR") { if (!Array.isArray(val)) throw unsupported("OR must be an array"); if (!val.some((w) => matchWhere(db, model, row, w))) return false; continue; }
    if (key === "NOT") { const list = Array.isArray(val) ? val : [val]; if (list.some((w) => matchWhere(db, model, row, w))) return false; continue; }
    const compound = expandCompound(model, key);
    if (compound) { for (const f of compound) if (!scalarMatches(model, model.fields[f], row[f], val[f])) return false; continue; }
    if (model.fields[key]) { if (!scalarMatches(model, model.fields[key], row[key], val)) return false; continue; }
    const rel = model.relations[key];
    if (rel) {
      const rows = relatedRows(db, model, rel, row);
      const target = REG[rel.to];
      if (rel.kind === "many") {
        if (!isPlainObject(val)) throw unsupported(`relation filter on ${model.name}.${key}`);
        for (const [op, w] of Object.entries(val)) {
          if (op === "some") { if (!rows.some((r) => matchWhere(db, target, r, w))) return false; }
          else if (op === "every") { if (!rows.every((r) => matchWhere(db, target, r, w))) return false; }
          else if (op === "none") { if (rows.some((r) => matchWhere(db, target, r, w))) return false; }
          else throw unsupported(`to-many relation operator "${op}" on ${model.name}.${key}`);
        }
        continue;
      }
      const related = rows[0] ?? null;
      if (val === null) { if (related) return false; continue; }
      if (!isPlainObject(val)) throw unsupported(`relation filter on ${model.name}.${key}`);
      const keys = Object.keys(val);
      if (keys.length && keys.every((k) => k === "is" || k === "isNot")) {
        if ("is" in val && val.is !== undefined) { if (val.is === null ? related : !(related && matchWhere(db, target, related, val.is))) return false; }
        if ("isNot" in val && val.isNot !== undefined) { if (val.isNot === null ? !related : related && matchWhere(db, target, related, val.isNot)) return false; }
      } else if (!(related && matchWhere(db, target, related, val))) return false; // `build: { userId }` shorthand for `is`
      continue;
    }
    throw unsupported(`where key "${key}" on ${model.name}`);
  }
  return true;
}

function assertUniqueWhere(model, where) {
  if (!isPlainObject(where)) throw fail("P2009", `${model.name}: a unique "where" is required`);
  for (const u of model.unique) {
    if (u.length === 1 ? where[u[0]] !== undefined && where[u[0]] !== null : isPlainObject(where[uniqueName(u)])) return;
  }
  throw fail("P2009", `${model.name}: "where" must contain a unique field (${model.unique.map(uniqueName).join(", ")})`);
}

// ------------------------------------------------------------------ static argument validation
// Runs BEFORE any data is read, so an unsupported argument fails the same way whether or not rows exist
// (otherwise an empty table would let an unsupported filter "succeed" with an empty result).
const SCALAR_OPS = new Set(["equals", "not", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith"]);
function validateCond(model, spec, cond) {
  if (cond === null || !isPlainObject(cond)) { if (spec.type === "json" && cond !== null) throw unsupported(`JSON equality filter on ${model.name}.${spec.name}`); return; }
  if (spec.type === "json") throw unsupported(`JSON filter on ${model.name}.${spec.name}`);
  for (const [op, arg] of Object.entries(cond)) {
    if (arg === undefined) continue;
    if (!SCALAR_OPS.has(op)) throw unsupported(`operator "${op}" on ${model.name}.${spec.name}`);
    if (op === "not" && isPlainObject(arg)) validateCond(model, spec, arg);
    if ((op === "contains" || op === "startsWith" || op === "endsWith") && spec.type !== "string") throw unsupported(`${op} on non-string ${model.name}.${spec.name}`);
  }
}
function validateWhere(model, where) {
  if (where === undefined || where === null) return;
  if (!isPlainObject(where)) throw unsupported(`where must be an object (${model.name})`);
  for (const [key, val] of Object.entries(where)) {
    if (val === undefined) continue;
    if (key === "AND" || key === "NOT") { for (const w of Array.isArray(val) ? val : [val]) validateWhere(model, w); continue; }
    if (key === "OR") { if (!Array.isArray(val)) throw unsupported("OR must be an array"); for (const w of val) validateWhere(model, w); continue; }
    const compound = expandCompound(model, key);
    if (compound) { if (!isPlainObject(val)) throw unsupported(`compound unique ${key} needs an object`); for (const f of compound) validateCond(model, model.fields[f], val[f]); continue; }
    if (model.fields[key]) { validateCond(model, model.fields[key], val); continue; }
    const rel = model.relations[key];
    if (!rel) throw unsupported(`where key "${key}" on ${model.name}`);
    const target = REG[rel.to];
    if (rel.kind === "many") {
      if (!isPlainObject(val)) throw unsupported(`relation filter on ${model.name}.${key}`);
      for (const [op, w] of Object.entries(val)) { if (!["some", "every", "none"].includes(op)) throw unsupported(`to-many relation operator "${op}" on ${model.name}.${key}`); validateWhere(target, w); }
    } else if (val !== null) {
      if (!isPlainObject(val)) throw unsupported(`relation filter on ${model.name}.${key}`);
      const keys = Object.keys(val);
      if (keys.length && keys.every((k) => k === "is" || k === "isNot")) { for (const k of keys) if (val[k] !== undefined && val[k] !== null) validateWhere(target, val[k]); }
      else validateWhere(target, val);
    }
  }
}
function validateOrderBy(model, orderBy) {
  if (orderBy === undefined) return;
  for (const o of Array.isArray(orderBy) ? orderBy : [orderBy]) {
    if (!isPlainObject(o)) throw unsupported("orderBy entry must be an object");
    for (const [f, dir] of Object.entries(o)) {
      if (!model.fields[f]) throw unsupported(`orderBy "${f}" on ${model.name} (only scalar fields)`);
      if (dir !== "asc" && dir !== "desc") throw unsupported(`orderBy direction ${JSON.stringify(dir)} on ${model.name}.${f}`);
    }
  }
}
function validateCountSpec(model, spec) {
  const sel = spec === true ? null : spec?.select;
  if (!isPlainObject(sel)) throw unsupported("_count requires { select: { relation: true } }");
  for (const [relName, v] of Object.entries(sel)) {
    if (!v) continue;
    const rel = model.relations[relName];
    if (!rel || rel.kind !== "many") throw unsupported(`_count of ${model.name}.${relName}`);
    if (isPlainObject(v)) { for (const k of Object.keys(v)) if (k !== "where") throw unsupported(`_count option "${k}"`); validateWhere(REG[rel.to], v.where); }
  }
}
function validateProjection(model, args) {
  const { select, include } = args ?? {};
  if (select !== undefined && include !== undefined) throw fail("P2009", `${model.name}: "select" and "include" cannot be used together`);
  const walk = (obj, isSelect) => {
    if (!isPlainObject(obj)) throw unsupported(`${isSelect ? "select" : "include"} must be an object`);
    for (const [k, v] of Object.entries(obj)) {
      if (!v) continue;
      if (k === "_count") { validateCountSpec(model, v); continue; }
      if (model.fields[k]) { if (!isSelect) throw unsupported(`include key "${k}" on ${model.name} (scalar)`); if (v !== true) throw unsupported(`select value for scalar ${model.name}.${k}`); continue; }
      const rel = model.relations[k];
      if (!rel) throw unsupported(`${isSelect ? "select" : "include"} key "${k}" on ${model.name}`);
      if (v !== true) validateArgs(REG[rel.to], v, ["select", "include", "where", "orderBy", "take", "skip"]);
    }
  };
  if (select !== undefined) walk(select, true);
  if (include !== undefined) walk(include, false);
}
function validateArgs(model, args, allowed) {
  if (args === undefined || args === null) return;
  if (!isPlainObject(args)) throw unsupported(`${model.name}: arguments must be an object`);
  for (const k of Object.keys(args)) if (args[k] !== undefined && !allowed.includes(k)) throw unsupported(`${model.name} argument "${k}"`);
  validateWhere(model, args.where);
  validateOrderBy(model, args.orderBy);
  validateProjection(model, args);
}
function validateUpdateData(model, data) {
  if (!isPlainObject(data)) throw fail("P2009", `${model.name}.update requires "data"`);
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (model.relations[k]) throw unsupported(`nested write "${k}" inside ${model.name}.update`);
    const spec = model.fields[k];
    if (!spec) throw fail("P2009", `Unknown field "${k}" on ${model.name}`);
    if (spec.type !== "json" && isPlainObject(v) && !isNullMarker(v)) {
      const ops = Object.keys(v);
      if (!(ops.length === 1 && ops[0] === "set")) throw unsupported(`update operator ${JSON.stringify(ops)} on ${model.name}.${k}`);
    }
  }
}

// ------------------------------------------------------------------ order / project
function sortRows(model, rows, orderBy) {
  if (orderBy === undefined) return rows;
  const list = Array.isArray(orderBy) ? orderBy : [orderBy];
  const keys = [];
  for (const o of list) {
    if (!isPlainObject(o)) throw unsupported("orderBy entry must be an object");
    for (const [f, dir] of Object.entries(o)) {
      if (!model.fields[f]) throw unsupported(`orderBy "${f}" on ${model.name} (only scalar fields)`);
      if (dir !== "asc" && dir !== "desc") throw unsupported(`orderBy direction ${JSON.stringify(dir)} on ${model.name}.${f}`);
      keys.push([f, dir]);
    }
  }
  return rows.map((r, i) => [r, i]).sort(([a, ia], [b, ib]) => {
    for (const [f, dir] of keys) {
      const x = a[f], y = b[f];
      if (x === y || (x == null && y == null)) continue;
      let c;
      if (x == null) c = 1; else if (y == null) c = -1; else c = cmp(x, y); // Postgres: NULLs sort last for asc
      if (dir === "desc") c = -c;
      if (c) return c;
    }
    return ia - ib;
  }).map(([r]) => r);
}

function checkArgs(model, op, args, allowed) {
  for (const k of Object.keys(args ?? {})) {
    if (args[k] === undefined) continue;
    if (!allowed.includes(k)) throw unsupported(`${model.name}.${op} argument "${k}"`);
  }
}

function pageRows(model, rows, args) {
  let out = sortRows(model, rows, args.orderBy);
  if (args.skip !== undefined) { if (!Number.isInteger(args.skip) || args.skip < 0) throw unsupported("skip must be a non-negative integer"); out = out.slice(args.skip); }
  if (args.take !== undefined) { if (!Number.isInteger(args.take) || args.take < 0) throw unsupported("negative take"); out = out.slice(0, args.take); }
  return out;
}

function scalarCopy(model, row) {
  const out = {};
  for (const f of Object.keys(model.fields)) out[f] = row[f] instanceof Date ? cloneRowValue(row[f]) : row[f] !== null && typeof row[f] === "object" && !(row[f] instanceof Uint8Array) ? jsonClone(row[f]) : row[f];
  return out;
}

function projectRelation(db, model, relName, row, sub) {
  const rel = model.relations[relName];
  const target = REG[rel.to];
  const rows = relatedRows(db, model, rel, row);
  const subArgs = sub === true ? {} : sub;
  if (!isPlainObject(subArgs)) throw unsupported(`relation selection for ${model.name}.${relName}`);
  checkArgs(target, `${relName} selection`, subArgs, ["select", "include", "where", "orderBy", "take", "skip"]);
  if (rel.kind === "many") {
    const filtered = rows.filter((r) => matchWhere(db, target, r, subArgs.where));
    return pageRows(target, filtered, subArgs).map((r) => project(db, target, r, subArgs));
  }
  const one = rows[0] ?? null;
  if (!one) return null;
  if (subArgs.where !== undefined) throw unsupported(`where inside a to-one selection (${model.name}.${relName})`);
  return project(db, target, one, subArgs);
}

function projectCount(db, model, row, spec) {
  const sel = spec === true ? null : spec?.select;
  if (!isPlainObject(sel)) throw unsupported("_count requires { select: { relation: true } }");
  const out = {};
  for (const [relName, v] of Object.entries(sel)) {
    if (!v) continue;
    const rel = model.relations[relName];
    if (!rel || rel.kind !== "many") throw unsupported(`_count of ${model.name}.${relName}`);
    const target = REG[rel.to];
    const where = isPlainObject(v) ? v.where : undefined;
    if (isPlainObject(v)) for (const k of Object.keys(v)) if (k !== "where") throw unsupported(`_count option "${k}"`);
    out[relName] = relatedRows(db, model, rel, row).filter((r) => matchWhere(db, target, r, where)).length;
  }
  return out;
}

function project(db, model, row, args) {
  const { select, include } = args ?? {};
  if (select !== undefined && include !== undefined) throw fail("P2009", `${model.name}: "select" and "include" cannot be used together`);
  if (select !== undefined) {
    if (!isPlainObject(select)) throw unsupported("select must be an object");
    const out = {};
    for (const [k, v] of Object.entries(select)) {
      if (!v) continue;
      if (k === "_count") out._count = projectCount(db, model, row, v);
      else if (model.fields[k]) { if (v !== true) throw unsupported(`select value for scalar ${model.name}.${k}`); out[k] = scalarCopy(model, row)[k]; }
      else if (model.relations[k]) out[k] = projectRelation(db, model, k, row, v);
      else throw unsupported(`select key "${k}" on ${model.name}`);
    }
    return out;
  }
  const out = scalarCopy(model, row);
  if (include !== undefined) {
    if (!isPlainObject(include)) throw unsupported("include must be an object");
    for (const [k, v] of Object.entries(include)) {
      if (!v) continue;
      if (k === "_count") out._count = projectCount(db, model, row, v);
      else if (model.relations[k]) out[k] = projectRelation(db, model, k, row, v);
      else throw unsupported(`include key "${k}" on ${model.name}`);
    }
  }
  return out;
}

// ------------------------------------------------------------------ writes
function fkTargetExists(db, model, fk, value) {
  for (const rel of Object.values(model.relations)) if (rel.kind === "one" && rel.fk === fk) {
    return db.tables[rel.to].some((t) => t[REG[rel.to].pk] === value);
  }
  return true; // plain string column without a relation
}

function checkUnique(db, model, row, selfRow) {
  for (const u of model.unique) {
    if (u.some((f) => row[f] === null || row[f] === undefined)) continue; // NULLs never collide
    const clash = db.tables[model.name].find((r) => r !== selfRow && u.every((f) => eq(r[f], row[f])));
    if (clash) throw fail("P2002", `Unique constraint failed on ${model.name}(${u.join(", ")})`);
  }
}
function checkFks(db, model, row) {
  for (const rel of Object.values(model.relations)) if (rel.kind === "one") {
    const v = row[rel.fk];
    if (v !== null && v !== undefined && !fkTargetExists(db, model, rel.fk, v)) throw fail("P2003", `Foreign key constraint failed on ${model.name}.${rel.fk}`);
  }
}

function applyScalars(model, row, data, { creating }) {
  for (const [k, raw] of Object.entries(data)) {
    if (raw === undefined) continue;
    const spec = model.fields[k];
    if (!spec) continue; // relation keys are handled by the caller
    let value = raw;
    if (!creating && spec.type !== "json" && isPlainObject(raw)) {
      const ops = Object.keys(raw);
      if (ops.length === 1 && ops[0] === "set") value = raw.set;
      else throw unsupported(`update operator ${JSON.stringify(ops)} on ${model.name}.${k}`);
    }
    row[k] = coerce(model, spec, value);
  }
}

function createRow(db, model, data) {
  if (!isPlainObject(data)) throw fail("P2009", `${model.name}.create requires "data"`);
  for (const k of Object.keys(data)) if (data[k] !== undefined && !model.fields[k] && !model.relations[k]) throw fail("P2009", `Unknown field "${k}" on ${model.name}`);
  const row = {};
  // nested to-one: create/connect resolved first, because they provide this row's fk
  const resolved = {};
  for (const [k, v] of Object.entries(data)) {
    const rel = model.relations[k];
    if (!rel || v === undefined) continue;
    if (!isPlainObject(v)) throw fail("P2009", `${model.name}.${k} expects a nested write`);
    for (const op of Object.keys(v)) if (!["create", "connect"].includes(op)) throw unsupported(`nested "${op}" on ${model.name}.${k}`);
    if (rel.kind === "one") {
      if (v.create && v.connect) throw fail("P2009", `${model.name}.${k}: choose create or connect`);
      if (v.connect) {
        const target = db.tables[rel.to].find((t) => matchWhere(db, REG[rel.to], t, v.connect));
        if (!target) throw fail("P2025", `Nested connect: no ${rel.to} record found`);
        if (data[rel.fk] !== undefined) throw fail("P2009", `${model.name}: both ${rel.fk} and ${k} given`);
        resolved[rel.fk] = target[REG[rel.to].pk];
      } else if (v.create) {
        const created = createRow(db, REG[rel.to], v.create);
        resolved[rel.fk] = created[REG[rel.to].pk];
      }
    }
  }
  applyScalars(model, row, { ...data, ...resolved }, { creating: true });
  for (const [f, spec] of Object.entries(model.fields)) {
    if (row[f] !== undefined) continue;
    const d = defaultFor(spec);
    if (d === undefined) throw fail("P2012", `Missing required value for ${model.name}.${f}`);
    row[f] = d;
  }
  checkFks(db, model, row);
  checkUnique(db, model, row, null);
  db.tables[model.name].push(row);
  // nested back-relations (children that reference this row)
  for (const [k, v] of Object.entries(data)) {
    const rel = model.relations[k];
    if (!rel || rel.kind === "one" || v === undefined) continue;
    const target = REG[rel.to];
    const toList = (x) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
    if (rel.kind === "one-back" && toList(v.create).length + toList(v.connect).length > 1) throw fail("P2009", `${model.name}.${k} accepts one record`);
    for (const child of toList(v.create)) createRow(db, target, { ...child, [rel.fk]: row[model.pk] });
    for (const sel of toList(v.connect)) {
      const t = db.tables[rel.to].find((r) => matchWhere(db, target, r, sel));
      if (!t) throw fail("P2025", `Nested connect: no ${rel.to} record found`);
      t[rel.fk] = row[model.pk];
      checkUnique(db, target, t, t);
    }
  }
  return row;
}

function updateRow(db, model, row, data) {
  if (!isPlainObject(data)) throw fail("P2009", `${model.name}.update requires "data"`);
  for (const k of Object.keys(data)) {
    if (data[k] === undefined) continue;
    if (model.relations[k]) throw unsupported(`nested write "${k}" inside ${model.name}.update`);
    if (!model.fields[k]) throw fail("P2009", `Unknown field "${k}" on ${model.name}`);
  }
  const next = { ...row };
  applyScalars(model, next, data, { creating: false });
  if (model.fields.updatedAt && data.updatedAt === undefined) next.updatedAt = new Date();
  checkFks(db, model, next);
  checkUnique(db, model, next, row);
  Object.assign(row, next);
}

// `pending` collects RESTRICT violations; they are only enforced once the whole cascade finished, because a
// cascade can remove the very rows that restrict the delete (Postgres evaluates the statement as a whole).
function deleteRow(db, model, row, pending) {
  const tbl = db.tables[model.name];
  const idx = tbl.indexOf(row);
  if (idx === -1) return;
  tbl.splice(idx, 1);
  for (const child of Object.values(REG)) for (const rel of Object.values(child.relations)) {
    if (rel.kind !== "one" || rel.to !== model.name) continue;
    const kids = db.tables[child.name].filter((c) => c[rel.fk] === row[model.pk]);
    if (!kids.length) continue;
    const optional = child.fields[rel.fk].optional;
    const action = rel.onDelete ?? (optional ? "setnull" : "restrict");
    if (action === "restrict" || (action === "setnull" && !optional)) { for (const kid of kids) pending.push([child, rel, kid]); continue; }
    for (const kid of kids) { if (action === "cascade") deleteRow(db, child, kid, pending); else kid[rel.fk] = null; }
  }
}
function deleteRows(db, model, rows) {
  const pending = [];
  for (const row of rows) deleteRow(db, model, row, pending);
  for (const [child, rel, kid] of pending) {
    if (db.tables[child.name].includes(kid)) throw fail("P2003", `Foreign key constraint failed: ${child.name}.${rel.fk} still references ${rel.to}`);
  }
}

// ------------------------------------------------------------------ delegate
const NOW = () => Date.now();

function makeDelegate(ctx, model) {
  const { db } = ctx;
  const find = (where) => db.tables[model.name].filter((r) => matchWhere(db, model, r, where));
  const gate = async () => { await db.ready; while (!ctx.inTx && db.txChain) await db.txChain; };
  const atomic = async (fn) => {
    await gate();
    const snap = snapshot(db);
    try { return fn(); } catch (e) { restore(db, snap); throw e; }
  };
  const read = async (fn) => { await gate(); return fn(); };
  const one = (op, args, allowed, { unique }) => {
    validateArgs(model, args, allowed);
    if (unique) assertUniqueWhere(model, args?.where);
  };
  const validate = (args, allowed) => validateArgs(model, args, allowed);
  const methods = {
    findUnique: (args) => read(() => { one("findUnique", args, ["where", "select", "include"], { unique: true }); const r = find(args.where)[0]; return r ? project(db, model, r, args) : null; }),
    findUniqueOrThrow: (args) => methods.findUnique(args).then((r) => { if (!r) throw fail("P2025", `No ${model.name} found`); return r; }),
    findFirst: (args = {}) => read(() => { validate(args, ["where", "select", "include", "orderBy", "take", "skip"]); const r = pageRows(model, find(args.where), { ...args, take: 1 })[0]; return r ? project(db, model, r, args) : null; }),
    findFirstOrThrow: (args) => methods.findFirst(args).then((r) => { if (!r) throw fail("P2025", `No ${model.name} found`); return r; }),
    findMany: (args = {}) => read(() => { validate(args, ["where", "select", "include", "orderBy", "take", "skip"]); return pageRows(model, find(args.where), args).map((r) => project(db, model, r, args)); }),
    count: (args = {}) => read(() => { validate(args, ["where"]); return find(args.where).length; }),
    create: (args) => atomic(() => { validate(args, ["data", "select", "include"]); return project(db, model, createRow(db, model, args.data), args); }),
    update: (args) => atomic(() => {
      one("update", args, ["where", "data", "select", "include"], { unique: true });
      validateUpdateData(model, args.data);
      const r = find(args.where)[0];
      if (!r) throw fail("P2025", `${model.name} to update not found`);
      updateRow(db, model, r, args.data);
      return project(db, model, r, args);
    }),
    updateMany: (args) => atomic(() => { validate(args, ["where", "data"]); validateUpdateData(model, args?.data); const rows = find(args.where); for (const r of rows) updateRow(db, model, r, args.data); return { count: rows.length }; }),
    upsert: (args) => atomic(() => {
      one("upsert", args, ["where", "create", "update", "select", "include"], { unique: true });
      validateUpdateData(model, args.update ?? {});
      const r = find(args.where)[0];
      if (r) { updateRow(db, model, r, args.update ?? {}); return project(db, model, r, args); }
      return project(db, model, createRow(db, model, args.create), args);
    }),
    delete: (args) => atomic(() => {
      one("delete", args, ["where", "select", "include"], { unique: true });
      const r = find(args.where)[0];
      if (!r) throw fail("P2025", `${model.name} to delete not found`);
      const out = project(db, model, r, args);
      deleteRows(db, model, [r]);
      return out;
    }),
    deleteMany: (args = {}) => atomic(() => { validate(args, ["where"]); const rows = find(args.where); deleteRows(db, model, rows); return { count: rows.length }; }),
  };
  return new Proxy(methods, {
    get(target, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop in target) return target[prop];
      return () => { throw unsupported(`${model.name}.${String(prop)}()`); };
    },
  });
}

// ------------------------------------------------------------------ raw SQL (rate limiter only)
const normSql = (strings) => strings.reduce((acc, s, i) => acc + (i ? `$${i}` : "") + s, "").replace(/\s+/g, " ").trim();
export const RATE_LIMIT_UPSERT_SQL =
  'INSERT INTO "RateLimitBucket" ("key", "count", "resetAt") VALUES ($1, 1, $2) ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "RateLimitBucket"."resetAt" <= NOW() THEN 1 ELSE "RateLimitBucket"."count" + 1 END, "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= NOW() THEN $3 ELSE "RateLimitBucket"."resetAt" END RETURNING "count", "resetAt"';
export const RATE_LIMIT_CLEANUP_SQL = `DELETE FROM "RateLimitBucket" WHERE "resetAt" < NOW() - INTERVAL '1 day'`;
// Row locks (`SELECT id FROM "<Table>" WHERE id = $1 FOR UPDATE`). Only these two exact statements exist in the app
// (checkout.ts: Build; create-intent route and webhook: Order). Each one reads ITS OWN table. The lock itself is
// provided by the fake's transaction serialisation: while a transaction is open every other operation waits, which
// is stricter than a row lock (unrelated rows wait too) and never weaker.
export const LOCK_SQL = {
  Build: 'SELECT id FROM "Build" WHERE id = $1 FOR UPDATE',
  Order: 'SELECT id FROM "Order" WHERE id = $1 FOR UPDATE',
};
const isTemplate = (s) => Array.isArray(s) && Array.isArray(s.raw);

// ------------------------------------------------------------------ client
function makeClient(db, inTx) {
  const ctx = { db, inTx };
  const delegates = {};
  const raw = {
    async $queryRaw(strings, ...values) {
      await db.ready; while (!inTx && db.txChain) await db.txChain;
      if (!isTemplate(strings)) throw unsupported("$queryRaw must be used as a tagged template");
      const lockTable = Object.keys(LOCK_SQL).find((name) => LOCK_SQL[name] === normSql(strings));
      if (lockTable) return db.tables[lockTable].filter((row) => row.id === values[0]).map((row) => ({ id: row.id }));
      if (normSql(strings) !== RATE_LIMIT_UPSERT_SQL) throw unsupported(`raw query: ${normSql(strings).slice(0, 120)}`);
      const [key, , freshResetAt] = values;
      const snap = snapshot(db);
      try {
        const table = db.tables.RateLimitBucket;
        let row = table.find((r) => r.key === key);
        if (!row) { row = { key, count: 1, resetAt: coerce(REG.RateLimitBucket, REG.RateLimitBucket.fields.resetAt, freshResetAt) }; table.push(row); }
        else if (row.resetAt.getTime() <= NOW()) { row.count = 1; row.resetAt = coerce(REG.RateLimitBucket, REG.RateLimitBucket.fields.resetAt, freshResetAt); }
        else row.count += 1;
        return [{ count: row.count, resetAt: new Date(row.resetAt.getTime()) }];
      } catch (e) { restore(db, snap); throw e; }
    },
    async $executeRaw(strings, ...values) {
      await db.ready; while (!inTx && db.txChain) await db.txChain;
      if (!isTemplate(strings)) throw unsupported("$executeRaw must be used as a tagged template");
      if (normSql(strings) !== RATE_LIMIT_CLEANUP_SQL || values.length) throw unsupported(`raw statement: ${normSql(strings).slice(0, 120)}`);
      const cutoff = NOW() - 24 * 60 * 60 * 1000;
      const before = db.tables.RateLimitBucket.length;
      db.tables.RateLimitBucket = db.tables.RateLimitBucket.filter((r) => r.resetAt.getTime() >= cutoff);
      return before - db.tables.RateLimitBucket.length;
    },
    async $transaction(arg, options) {
      if (inTx) throw unsupported("nested $transaction");
      if (Array.isArray(arg)) throw unsupported("$transaction([...]) array form (use the interactive callback form)");
      if (typeof arg !== "function") throw unsupported("$transaction argument");
      void options;
      await db.ready;
      while (db.txChain) await db.txChain;
      let release;
      const mine = new Promise((r) => { release = r; });
      db.txChain = mine;
      const snap = snapshot(db);
      try {
        return await arg(makeClient(db, true));
      } catch (e) {
        restore(db, snap);
        throw e;
      } finally {
        if (db.txChain === mine) db.txChain = null;
        release();
      }
    },
    async $connect() {},
    async $disconnect() {},
  };
  return new Proxy(raw, {
    get(target, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop in target) return target[prop];
      if (typeof prop === "string" && prop.startsWith("$")) return () => { throw unsupported(`${prop}()`); };
      const name = String(prop);
      const model = Object.values(REG).find((m) => m.accessor === name);
      if (model) return (delegates[name] ??= makeDelegate(ctx, model));
      if (/^[a-z]\w*$/.test(name)) { // any other model-looking accessor (order, session, ...): loud error on use, never empty data
        return new Proxy({}, { get(_, m) { if (typeof m === "symbol" || m === "then") return undefined; return () => { throw unsupported(`model "${name}" is not implemented in Fake Prisma (${name}.${String(m)})`); }; } });
      }
      return undefined;
    },
  });
}

export function createFakePrismaClient(db) {
  return makeClient(db, false);
}
