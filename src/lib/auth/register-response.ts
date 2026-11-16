// file: src/lib/auth/register-response.ts
//
// M4: POST /api/auth/register must not reveal whether an email address already has an account. A new address and an existing
// one get the SAME status and the SAME body (nothing about the account, not even its id or role), and the client messages
// below never say "already registered". Pure constants so the clients and the tests share one definition.
export const REGISTER_ACCEPTED_STATUS = 201;
export const REGISTER_ACCEPTED_BODY = { ok: true } as const;

// Shown when the automatic sign-in right after signing up does not succeed. With an existing account and a different
// password that is exactly what happens, so the wording must fit both situations without confirming either.
export const SIGNUP_SIGNIN_FAILED_MESSAGE =
  "We couldn't create your account or sign you in with these details. If you may already have an account, log in instead or reset your password.";
