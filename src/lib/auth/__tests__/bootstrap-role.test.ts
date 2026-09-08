// file: src/lib/auth/__tests__/bootstrap-role.test.ts
//
// P1-10 regression: ADMIN_EMAILS must only ever bootstrap the FIRST admin
// account, never mint another just by matching the allowlist once an admin
// already exists. See src/lib/auth/bootstrap-role.ts for the full
// rationale and app/api/auth/register/route.ts for how the atomicity of
// the "does an admin exist" check is guaranteed against concurrent
// registrations.
import assert from "node:assert/strict";
import { parseAdminEmails, resolveBootstrapRole } from "../bootstrap-role";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/auth/bootstrap-role", {
    "parseAdminEmails splits, trims, and lowercases a comma-separated list"() {
      assert.deepEqual(parseAdminEmails(" Admin@Example.com , second@example.com "), [
        "admin@example.com",
        "second@example.com",
      ]);
    },

    "parseAdminEmails drops empty entries from stray commas"() {
      assert.deepEqual(parseAdminEmails("a@example.com,,b@example.com,"), ["a@example.com", "b@example.com"]);
    },

    "parseAdminEmails returns an empty list when unset"() {
      assert.deepEqual(parseAdminEmails(undefined), []);
      assert.deepEqual(parseAdminEmails(""), []);
    },

    "resolveBootstrapRole: an email not on the allowlist is always USER, admin or not"() {
      assert.equal(resolveBootstrapRole(false, false), "USER");
      assert.equal(resolveBootstrapRole(false, true), "USER");
    },

    "resolveBootstrapRole: an allowlisted email becomes ADMIN only when no admin exists yet"() {
      assert.equal(resolveBootstrapRole(true, false), "ADMIN");
    },

    "resolveBootstrapRole: an allowlisted email falls back to USER once an admin already exists (no standing backdoor)"() {
      assert.equal(resolveBootstrapRole(true, true), "USER");
    },
  });
}
