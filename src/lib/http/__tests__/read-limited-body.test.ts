// file: src/lib/http/__tests__/read-limited-body.test.ts
//
// M1 regression: the webhook limit (256 KB) was applied AFTER `req.text()` had buffered the entire body, so a chunked request or a
// request without / with a false Content-Length was fully loaded first. The limit is now enforced while the stream is read.
import assert from "node:assert/strict";
import { BodyTooLargeError, readTextWithLimit } from "../read-limited-body";
import { runSuite } from "../../../testing/test-harness";

const enc = new TextEncoder();

function streamOf(chunks: Uint8Array[], onCancel?: () => void, onPull?: () => void) {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull?.();
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
    cancel() { onCancel?.(); },
  });
}

function post(body: ReadableStream<Uint8Array> | string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/x", { method: "POST", body, headers, ...(typeof body === "string" ? {} : { duplex: "half" }) } as RequestInit);
}

export async function runAll() {
  return runSuite("lib/http/read-limited-body", {
    async "a normal body is returned unchanged"() {
      assert.equal(await readTextWithLimit(post('{"a":1}'), 100), '{"a":1}');
    },
    async "an empty body is an empty string"() {
      assert.equal(await readTextWithLimit(new Request("http://localhost/x", { method: "POST" }), 100), "");
    },
    async "exactly the limit passes; one byte more is refused"() {
      assert.equal((await readTextWithLimit(post("x".repeat(100)), 100)).length, 100);
      await assert.rejects(() => readTextWithLimit(post("x".repeat(101)), 100), BodyTooLargeError);
    },
    async "a truthful Content-Length over the limit is refused without reading the body"() {
      let pulls = 0;
      const stream = streamOf([enc.encode("x".repeat(500))], undefined, () => pulls++);
      await assert.rejects(() => readTextWithLimit(post(stream, { "content-length": "500" }), 100), BodyTooLargeError);
      assert.equal(pulls <= 1, true, "the stream was not consumed");
    },
    async "a CHUNKED body (no Content-Length) over the limit is refused part-way and the source is cancelled"() {
      let cancelled = false;
      let pulled = 0;
      // an effectively endless body: 1000 chunks of 1 KB against a 4 KB limit
      const chunks = Array.from({ length: 1000 }, () => enc.encode("x".repeat(1024)));
      const req = post(streamOf(chunks, () => { cancelled = true; }, () => { pulled++; }));
      assert.equal(req.headers.get("content-length"), null, "no Content-Length header");
      await assert.rejects(() => readTextWithLimit(req, 4096), BodyTooLargeError);
      assert.equal(cancelled, true, "the stream was cancelled");
      assert.ok(pulled < 20, `only a few chunks were pulled, not the whole body (pulled ${pulled})`);
    },
    async "a LYING Content-Length (small) cannot smuggle a large body"() {
      const chunks = Array.from({ length: 200 }, () => enc.encode("x".repeat(1024)));
      await assert.rejects(() => readTextWithLimit(post(streamOf(chunks), { "content-length": "10" }), 4096), BodyTooLargeError);
    },
    async "multi-byte characters split across chunk boundaries decode correctly"() {
      const bytes = enc.encode("مرحبا بالعالم €🙂");
      const chunks = [bytes.slice(0, 3), bytes.slice(3, 4), bytes.slice(4)];
      assert.equal(await readTextWithLimit(post(streamOf(chunks)), 1000), "مرحبا بالعالم €🙂");
    },
    async "the limit counts BYTES, not characters"() {
      const arabic = "ع".repeat(60); // 120 bytes
      await assert.rejects(() => readTextWithLimit(post(arabic), 100), BodyTooLargeError);
      assert.equal(await readTextWithLimit(post(arabic), 120), arabic);
    },
    async "malformed JSON is returned as text for the caller to reject (this helper only limits size)"() {
      assert.equal(await readTextWithLimit(post("{not json"), 100), "{not json");
    },
    async "BodyTooLargeError carries the limit"() {
      try { await readTextWithLimit(post("x".repeat(10)), 5); assert.fail("should throw"); } catch (e) { assert.ok(e instanceof BodyTooLargeError); assert.equal((e as BodyTooLargeError).maxBytes, 5); }
    },
  });
}
