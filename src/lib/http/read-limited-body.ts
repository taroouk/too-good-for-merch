// file: src/lib/http/read-limited-body.ts
//
// M1: read a request body WITH a hard size limit while it streams in. `req.text()` buffers the whole body first and only then can
// be measured, so a chunked upload (no Content-Length) or a header that understates the size would be fully loaded before any
// limit applied. Here the byte counter runs on every chunk and the stream is cancelled the moment it passes the limit, so at
// most `maxBytes` plus one chunk is ever held. Pure Web-Streams code (no Prisma, no Next) so it is unit tested directly.
export class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body is larger than ${maxBytes} bytes.`);
    this.name = "BodyTooLargeError";
  }
}

export async function readTextWithLimit(req: Request, maxBytes: number): Promise<string> {
  // A truthful Content-Length lets us refuse before reading anything. It is only a shortcut: a missing or understated header
  // is caught by the byte counter below.
  const announced = Number(req.headers.get("content-length"));
  if (Number.isFinite(announced) && announced > maxBytes) {
    try { await req.body?.cancel(); } catch { /* the body may already be locked or closed */ }
    throw new BodyTooLargeError(maxBytes);
  }
  if (!req.body) return "";

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(all);
}
