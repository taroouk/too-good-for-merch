// file: src/lib/auth/__tests__/register-response.test.ts
//
// M4 regression: the register endpoint answered 409 "Email already in use." for an existing address, which lets anyone check
// whether a given email is registered. The accepted response is now identical for new and existing addresses.
import assert from "node:assert/strict";
import { REGISTER_ACCEPTED_BODY, REGISTER_ACCEPTED_STATUS, SIGNUP_SIGNIN_FAILED_MESSAGE } from "../register-response";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/auth/register-response", {
    "the accepted response is a plain 201 with no account data (no id, email or role)"() {
      assert.equal(REGISTER_ACCEPTED_STATUS, 201);
      assert.deepEqual(REGISTER_ACCEPTED_BODY, { ok: true });
      assert.deepEqual(Object.keys(REGISTER_ACCEPTED_BODY), ["ok"]);
    },
    "the sign-up failure message never says the address is registered / in use / taken"() {
      assert.doesNotMatch(SIGNUP_SIGNIN_FAILED_MESSAGE, /already (registered|in use|exists|taken)|in use|taken|exists/i);
      assert.match(SIGNUP_SIGNIN_FAILED_MESSAGE, /already have an account/i, "it may suggest logging in without confirming an account exists");
      assert.match(SIGNUP_SIGNIN_FAILED_MESSAGE, /reset your password/i);
    },
  });
}
