import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { handleApiMessage } from "../src/devAPIChild";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nestly-api-child-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeApi(name: string, contents: string) {
  const filePath = path.join(root, `${name}.ts`);
  fs.writeFileSync(filePath, contents);
  return filePath;
}

describe("handleApiMessage", () => {
  let errorSpy: any;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the handler and sends its result", async () => {
    const file = writeApi(
      "ok",
      `export async function GET() { return { status: 201, body: { ok: true } }; }`
    );
    const send = vi.fn();

    await handleApiMessage(
      { file, method: "GET", url: "/ok" },
      send
    );

    expect(send).toHaveBeenCalledWith({
      type: "apiResponse",
      status: 201,
      body: { ok: true },
    });
  });

  it("passes route params to the handler", async () => {
    const file = writeApi(
      "params",
      `export async function POST(req: any) {
        return { status: 200, body: { slug: req.params.slug } };
      }`
    );
    const send = vi.fn();

    await handleApiMessage(
      { file, method: "POST", url: "/blog/hello", params: { slug: "hello" } },
      send
    );

    expect(send).toHaveBeenCalledWith({
      type: "apiResponse",
      status: 200,
      body: { slug: "hello" },
    });
  });

  it("defaults the status to 200", async () => {
    const file = writeApi(
      "default-status",
      `export async function GET() { return { body: "ok" }; }`
    );
    const send = vi.fn();

    await handleApiMessage({ file, method: "GET", url: "/" }, send);

    expect(send).toHaveBeenCalledWith({
      type: "apiResponse",
      status: 200,
      body: "ok",
    });
  });

  it("reports not found when the method is missing", async () => {
    const file = writeApi("missing", `export const GET = 1;`);
    const send = vi.fn();

    await handleApiMessage({ file, method: "POST", url: "/" }, send);

    expect(send).toHaveBeenCalledWith({ type: "apiNotFound" });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("reports not found when the export is not a function", async () => {
    const file = writeApi("not-function", `export const GET = 1;`);
    const send = vi.fn();

    await handleApiMessage({ file, method: "GET", url: "/" }, send);

    expect(send).toHaveBeenCalledWith({ type: "apiNotFound" });
  });

  it("returns 500 when the handler returns nothing", async () => {
    const file = writeApi(
      "no-result",
      `export async function GET() { return undefined; }`
    );
    const send = vi.fn();

    await handleApiMessage({ file, method: "GET", url: "/" }, send);

    expect(send.mock.calls[0][0].status).toBe(500);
    expect(send.mock.calls[0][0].body.error).toContain(
      "did not return a result"
    );
  });

  it("returns 500 when the handler throws", async () => {
    const file = writeApi(
      "throws",
      `export async function GET() { throw new Error("boom"); }`
    );
    const send = vi.fn();

    await handleApiMessage({ file, method: "GET", url: "/" }, send);

    expect(send.mock.calls[0][0].status).toBe(500);
    expect(send.mock.calls[0][0].body.error).toContain("boom");
  });

  it("uses a no-op sender when process.send is unavailable", async () => {
    const file = writeApi(
      "default-send",
      `export async function GET() { return { status: 200, body: "ok" }; }`
    );
    const original = process.send;
    (process as any).send = undefined;

    await expect(
      handleApiMessage({ file, method: "GET", url: "/" })
    ).resolves.toBeUndefined();

    (process as any).send = original;
  });
});
