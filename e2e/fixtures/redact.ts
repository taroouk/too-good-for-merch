// Redaction for anything the test tooling writes down (diagnostics attachment, failure messages, reports). A payment provider's checkout URL
// carries a client secret and the public key in its query string, an API call carries a token in a header or a JSON body: none of these may
// reach a log, an attachment or an assertion message. Pure and dependency-free so it can be unit-tested (tests/redaction.spec.ts).
const NAMES = "client_?secret|public_?key|payment_?token|auth_?token|access_?token|refresh_?token|session_?token|api_?key|secret_?key|secret|token|hmac|authorization|password|passwd";
const PAIR = new RegExp(`((?:${NAMES})["']?\\s*[=:]\\s*["']?)(?:(?:Token|Bearer)\\s+)?[^&\\s"',;}\\]]+`, "gi"); // key=value, "key":"value", key: value
const SCHEME = /\b(Token|Bearer)\s+[A-Za-z0-9._~+\/=-]{8,}/g; // Authorization: Token <secret>
const PAYMOB_KEY = /\begy_(?:sk|pk)_(?:test|live)_[A-Za-z0-9]+/g; // a Paymob key value wherever it appears
const LONG_TOKEN = /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g; // a JWT (a payment token / session token)

export function redact(text: string): string {
  return String(text).replace(PAIR, "$1[redacted]").replace(SCHEME, "$1 [redacted]").replace(PAYMOB_KEY, "egy_[redacted]").replace(LONG_TOKEN, "[jwt-redacted]");
}

// What an assertion message may say about requests that left localhost: host and path only, never a query string or fragment.
export function describeExternal(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const keys = [...u.searchParams.keys()];
    return `${u.protocol}//${u.host}${u.pathname}${keys.length ? ` (query params: ${keys.join(", ")}; values hidden)` : ""}`;
  } catch {
    return redact(rawUrl).slice(0, 80);
  }
}
