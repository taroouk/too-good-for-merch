// file: src/lib/admin/__tests__/price-grid.test.ts
import assert from "node:assert/strict";
import { buildPriceGrid, planGridChanges, type GridRule } from "../price-grid";
import { runSuite } from "../../../testing/test-harness";

const rule = (id: string, min: number, max: number, price: number, fabric = "SIGNATURE_200"): GridRule => ({ id, product: "FITTED", fabric, minQty: min, maxQty: max, unitPrice: price });

export async function runAll() {
  return runSuite("admin/price-grid", {
    "cells show the built-in default when no rule exists"() {
      const [col] = buildPriceGrid([], [{ product: "FITTED", fabric: "SIGNATURE_200" }]);
      assert.equal(col.cells.length, 10);
      assert.equal(col.cells[0].price, 9.54);
      assert.equal(col.cells[0].source, "default");
      assert.equal(col.editable, true);
    },
    "a rule overrides the default for its range only"() {
      const [col] = buildPriceGrid([rule("a", 1, 10, 12)], [{ product: "FITTED", fabric: "SIGNATURE_200" }]);
      assert.equal(col.cells[0].price, 12);
      assert.equal(col.cells[0].source, "custom");
      assert.equal(col.cells[0].ruleId, "a");
      assert.equal(col.cells[1].source, "default");
    },
    "unpriced combos show none; non-standard tiers make the column read-only"() {
      const [none] = buildPriceGrid([], [{ product: "FITTED", fabric: "HEAVYWEIGHT_300" }]);
      assert.equal(none.cells[0].source, "none");
      assert.equal(none.cells[0].price, null);
      const [odd] = buildPriceGrid([rule("x", 1, 50, 7)], [{ product: "FITTED", fabric: "SIGNATURE_200" }]);
      assert.equal(odd.editable, false);
      assert.equal(odd.cells[0].price, 7);
      assert.equal(odd.cells[2].price, 7); // 31-50 starts inside the 1-50 tier
      assert.equal(odd.cells[3].source, "default"); // 51-80 is outside it
    },
    "planGridChanges creates, updates and removes"() {
      const rules = [rule("a", 1, 10, 12), rule("b", 11, 30, 11)];
      const plan = planGridChanges(rules, [
        { product: "FITTED", fabric: "SIGNATURE_200", minQty: 1, maxQty: 10, price: 13.456 }, // update (rounded)
        { product: "FITTED", fabric: "SIGNATURE_200", minQty: 11, maxQty: 30, price: null }, // remove -> default
        { product: "FITTED", fabric: "SIGNATURE_200", minQty: 31, maxQty: 50, price: 7 }, // create
        { product: "FITTED", fabric: "SIGNATURE_200", minQty: 51, maxQty: 80, price: null }, // nothing to remove
      ]);
      assert.deepEqual(plan.update.map((u) => [u.id, u.unitPrice]), [["a", 13.46]]);
      assert.deepEqual(plan.remove.map((r) => r.id), ["b"]);
      assert.deepEqual(plan.create.map((c) => [c.minQty, c.maxQty, c.unitPrice]), [[31, 50, 7]]);
      assert.equal(plan.errors.length, 0);
    },
    "planGridChanges rejects bad input and custom-tier combos"() {
      const plan = planGridChanges([rule("x", 1, 50, 7)], [
        { product: "FITTED", fabric: "SIGNATURE_200", minQty: 1, maxQty: 10, price: 5 },
        { product: "FITTED", fabric: "ESSENTIALS_170", minQty: 1, maxQty: 10, price: -1 },
        { product: "FITTED", fabric: "ESSENTIALS_170", minQty: 2, maxQty: 9, price: 5 },
        { product: "FITTED", fabric: "ESSENTIALS_170", minQty: 11, maxQty: 30, price: 1e9 },
      ]);
      assert.equal(plan.errors.length, 4);
      assert.equal(plan.create.length + plan.update.length + plan.remove.length, 0);
    },
  });
}
