import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, it, expect } from "vitest";
import { BodyTooLargeError, MAX_BODY_BYTES, readBody } from "../../src/http/body.js";

/** A request body streamed as the given chunks, without Content-Length unless given. */
function request(chunks: Iterable<Buffer> | AsyncIterable<Buffer>, headers: IncomingHttpHeaders = {}): IncomingMessage {
  return Object.assign(Readable.from(chunks, { objectMode: false }), { headers }) as unknown as IncomingMessage;
}

/** A request whose body the test pushes by hand. */
function pushed(headers: IncomingHttpHeaders): IncomingMessage {
  return Object.assign(new Readable({ read: () => undefined }), { headers }) as unknown as IncomingMessage;
}

/** Yields `size`-byte chunks forever, counting how many were pulled. */
function endless(size: number): { chunks: Generator<Buffer>; pulled: () => number } {
  let count = 0;
  function* chunks(): Generator<Buffer> {
    for (;;) {
      count += 1;
      yield Buffer.alloc(size, "a");
    }
  }
  return { chunks: chunks(), pulled: () => count };
}

describe("readBody", () => {
  it("caps the body at 64 KiB", () => {
    expect(MAX_BODY_BYTES).toBe(65_536);
  });

  it("returns the body text", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    await expect(readBody(request([Buffer.from(body)]))).resolves.toBe(body);
  });

  it("returns an empty string for an empty body", async () => {
    await expect(readBody(request([]))).resolves.toBe("");
  });

  it("accepts exactly 65,536 bytes, declared and streamed in chunks", async () => {
    const chunks = [Buffer.alloc(40_000, "a"), Buffer.alloc(25_536, "b")];
    const text = await readBody(request(chunks, { "content-length": "65536" }));
    expect(text).toHaveLength(65_536);
    expect(text.endsWith("b")).toBe(true);
  });

  it("refuses a declared Content-Length of 65,537 without reading the body", async () => {
    let pulled = false;
    const req = request(
      (function* () {
        pulled = true;
        yield Buffer.from("{}");
      })(),
      { "content-length": "65537" },
    );
    await expect(readBody(req)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(pulled).toBe(false);
    expect(req.readableFlowing).toBeNull();
  });

  it("refuses a streamed body of 65,537 bytes without Content-Length", async () => {
    const chunks = [Buffer.alloc(65_536, "a"), Buffer.from("b")];
    await expect(readBody(request(chunks))).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("refuses a streamed body that goes over a smaller declared Content-Length", async () => {
    const chunks = [Buffer.alloc(40_000, "a"), Buffer.alloc(40_000, "b")];
    await expect(readBody(request(chunks, { "content-length": "10" }))).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("refuses a streamed body as soon as it goes over, without waiting for its end", async () => {
    const { chunks, pulled } = endless(16_384);
    const req = request(chunks);
    await expect(readBody(req)).rejects.toBeInstanceOf(BodyTooLargeError);
    const pulledAtRefusal = pulled();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(pulled()).toBe(pulledAtRefusal); // paused: nothing more is read
    expect(req.isPaused()).toBe(true);
  });

  it("keeps a multi-byte UTF-8 character split across chunks whole", async () => {
    const bytes = Buffer.from('{"q":"Aiguille du Goûter ⛰ 𝄞"}');
    const goute = bytes.indexOf(Buffer.from("û"));
    const clef = bytes.indexOf(Buffer.from("𝄞"));
    const chunks = [
      bytes.subarray(0, goute + 1), // first byte of "û"
      bytes.subarray(goute + 1, clef + 2), // second byte of "û" … first half of "𝄞"
      bytes.subarray(clef + 2, clef + 3),
      bytes.subarray(clef + 3),
    ];
    await expect(readBody(request(chunks))).resolves.toBe('{"q":"Aiguille du Goûter ⛰ 𝄞"}');
  });

  it("rejects with the stream error when the request fails", async () => {
    const req = pushed({});
    const body = readBody(req);
    req.push(Buffer.from("{"));
    const failure = new Error("aborted");
    req.destroy(failure);
    await expect(body).rejects.toBe(failure);
  });

  it("rejects when the request closes before its end", async () => {
    const req = pushed({});
    const body = readBody(req);
    req.push(Buffer.from("{"));
    req.destroy();
    await expect(body).rejects.toThrow("request closed before the end of its body");
  });
});
