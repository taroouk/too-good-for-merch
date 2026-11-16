"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOOGLE_GEMINI_INTERACTIONS_ENDPOINT = void 0;
exports.resolveGeminiEndpoint = resolveGeminiEndpoint;
// ISOLATED-COPY ONLY (installed by run-isolated.mjs --gemini-stub-in-production). The real src/lib/mockups/gemini-endpoint.ts ignores
// GEMINI_API_ENDPOINT in production, so a Production BUILD cannot talk to the local Gemini stand-in. To still run the whole browser suite
// against a production build, the copy gets this variant: the override is honoured, but ONLY for a loopback host -- anything else still
// resolves to Google's address, which the network guard blocks. The repository file is untouched.
exports.GOOGLE_GEMINI_INTERACTIONS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
function resolveGeminiEndpoint(env) {
    const override = env.GEMINI_API_ENDPOINT?.trim();
    if (!override)
        return exports.GOOGLE_GEMINI_INTERACTIONS_ENDPOINT;
    try {
        const url = new URL(override);
        const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        return loopback && (url.protocol === "http:" || url.protocol === "https:") ? url.toString() : exports.GOOGLE_GEMINI_INTERACTIONS_ENDPOINT;
    }
    catch {
        return exports.GOOGLE_GEMINI_INTERACTIONS_ENDPOINT;
    }
}
