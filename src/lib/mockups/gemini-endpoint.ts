// file: src/lib/mockups/gemini-endpoint.ts
//
// Where the Gemini request goes. Always Google's endpoint, except in NON-production when GEMINI_API_ENDPOINT points at a loopback
// address: that is how the tests use a local stand-in (scripts/isolation/gemini-stub.mjs) without spending Gemini credit. The override
// is ignored in production and for any non-loopback host, so a stray variable can never redirect the API key to another server.
export const GOOGLE_GEMINI_INTERACTIONS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

export function resolveGeminiEndpoint(env: Record<string, string | undefined>): string {
  const override = env.GEMINI_API_ENDPOINT?.trim();
  if (!override || env.NODE_ENV === "production") return GOOGLE_GEMINI_INTERACTIONS_ENDPOINT;
  try {
    const url = new URL(override);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return loopback && (url.protocol === "http:" || url.protocol === "https:") ? url.toString() : GOOGLE_GEMINI_INTERACTIONS_ENDPOINT;
  } catch {
    return GOOGLE_GEMINI_INTERACTIONS_ENDPOINT;
  }
}
