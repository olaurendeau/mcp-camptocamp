import type { IncomingMessage } from "node:http";

// A JSON-RPC request, even a batch, fits easily: tool arguments are short keywords and IDs.
export const MAX_BODY_BYTES = 64 * 1024;

export class BodyTooLargeError extends Error {
  override name = "BodyTooLargeError";
  constructor() {
    super(`request body over ${MAX_BODY_BYTES} bytes`);
  }
}

// Reads the request body as UTF-8 text, at most MAX_BODY_BYTES:
// - a declared Content-Length over the cap is refused before any byte is read;
// - a streamed body is refused as soon as its byte count goes over, whatever Content-Length said.
// On refusal the request is left paused, not destroyed, so the caller can still answer 413 (with
// `Connection: close`, since the rest of the body is never read).
export function readBody(request: IncomingMessage): Promise<string> {
  if (Number(request.headers["content-length"]) > MAX_BODY_BYTES) {
    return Promise.reject(new BodyTooLargeError());
  }
  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder(); // `stream: true` keeps a character split across chunks whole
    let text = "";
    let bytes = 0;
    const onData = (chunk: Buffer): void => {
      bytes += chunk.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        request.pause();
        settle();
        reject(new BodyTooLargeError());
        return;
      }
      text += decoder.decode(chunk, { stream: true });
    };
    const onEnd = (): void => {
      settle();
      resolve(text + decoder.decode());
    };
    const onError = (error: Error): void => {
      settle();
      reject(error);
    };
    const onClose = (): void => {
      settle();
      reject(new Error("request closed before the end of its body"));
    };
    const settle = (): void => {
      request.off("data", onData).off("end", onEnd).off("error", onError).off("close", onClose);
    };
    request.on("data", onData).on("end", onEnd).on("error", onError).on("close", onClose);
  });
}
