// file: src/studio/render/gemini-retry.ts
//
// Pure retry-classification logic for the Gemini call in
// app/api/mockups/nanobanana/route.ts (P1-12). Extracted out of the route
// file, same reasoning as gemini-prompt.ts: zero server-only imports, so
// this can be unit-tested by the plain-tsc/node harness -- see
// __tests__/gemini-retry.test.ts. Narrow on purpose: only a failure that's
// actually transient (a 5xx, or Gemini's own "Deadline expired ..."
// DEADLINE_EXCEEDED-class wording) is retryable. A genuine 4xx (bad
// request, blocked prompt, invalid API key) never becomes correct by
// retrying the identical request, so those fail immediately.

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseGeminiJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function geminiErrorFromData(value: unknown): string | null {
  const root = asRecord(value);
  if (!root) return null;

  const error = root.error;
  if (typeof error === "string") return error;

  const errorRecord = asRecord(error);
  const errorMessageValue =
    stringValue(errorRecord?.message) ??
    stringValue(errorRecord?.status) ??
    stringValue(errorRecord?.code);
  if (errorMessageValue) return errorMessageValue;

  const promptFeedback = asRecord(root.promptFeedback ?? root.prompt_feedback);
  const blockReason = stringValue(promptFeedback?.blockReason ?? promptFeedback?.block_reason);
  if (blockReason) return `Gemini prompt blocked: ${blockReason}`;

  for (const candidate of asArray(root.candidates)) {
    const candidateRecord = asRecord(candidate);
    const finishReason = stringValue(
      candidateRecord?.finishReason ?? candidateRecord?.finish_reason,
    );
    if (finishReason && finishReason !== "STOP") {
      return `Gemini candidate finished without an image: ${finishReason}`;
    }
  }

  return null;
}

export function isRetryableGeminiFailure(status: number, responseBody: string): boolean {
  if (status >= 500) return true;
  const parsedError = geminiErrorFromData(parseGeminiJson(responseBody));
  return typeof parsedError === "string" && /deadline/i.test(parsedError);
}
