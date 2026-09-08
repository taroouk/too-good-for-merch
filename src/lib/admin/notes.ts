// file: src/lib/admin/notes.ts
//
// Pure, DB-free note-target-existence DECISION logic (P3-21g), split out of
// addAdminNoteAction (src/actions/admin-order-actions.ts) and
// addBespokeRequestNoteAction (src/actions/admin-bespoke-actions.ts)
// specifically so the "does the parent record this note is being attached
// to actually exist" guard is unit testable without a Prisma-dependent test
// harness -- same pattern as src/lib/admin/access.ts (P1-9) and
// src/lib/orders/errors.ts (P0-5). Takes a plain nullable value (not a
// Prisma model instance), so a test can hand it `null` or a bare `{ id }`
// object without ever touching Prisma or a database.
//
// Both call sites already look up the parent with a `select: { id: true }`
// query and then reject a null result before writing the note -- this just
// names that exact decision so it's independently regression-tested, while
// the actions themselves keep doing the real Prisma lookup and pass the
// result straight through here unchanged.
export function requireNoteParent<T>(parent: T | null | undefined, notFoundMessage: string): T {
  if (!parent) throw new Error(notFoundMessage);
  return parent;
}
