import { describe, it, expect } from "vitest";
import { Readable } from "stream";
import {
  MAX_BODY_BYTES,
  RequestBodyError,
  readRequestBody,
} from "../src/requestBody";

function request(body: string | null, contentType?: string) {
  const stream: any = Readable.from(
    body === null ? [] : [Buffer.from(body)]
  );
  stream.headers = contentType ? { "content-type": contentType } : {};
  return stream;
}

describe("readRequestBody", () => {
  it("returns undefined for an empty body", async () => {
    await expect(readRequestBody(request(null))).resolves.toBeUndefined();
  });

  it("parses JSON bodies", async () => {
    await expect(
      readRequestBody(request('{"ok":true}', "application/json"))
    ).resolves.toEqual({ ok: true });
  });

  it("returns text for other content types", async () => {
    await expect(
      readRequestBody(request("hello", "text/plain"))
    ).resolves.toBe("hello");
  });

  it("rejects invalid JSON", async () => {
    await expect(
      readRequestBody(request("{", "application/json"))
    ).rejects.toMatchObject({ status: 400, message: "Invalid JSON" });
  });

  it("rejects oversized bodies", async () => {
    await expect(
      readRequestBody(
        request("x".repeat(MAX_BODY_BYTES + 1), "text/plain")
      )
    ).rejects.toBeInstanceOf(RequestBodyError);
  });
});
