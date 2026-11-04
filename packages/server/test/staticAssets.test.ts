import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "events";
import { Writable } from "stream";
import { finished } from "stream/promises";
import {
  isStaticAssetPath,
  serveClientAsset,
  serveStaticAsset,
} from "../src/staticAssets";

let root: string;
const originalCwd = process.cwd();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nestly-static-"));
  process.chdir(root);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function write(relative: string, contents = "") {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  return filePath;
}

function streamResponse() {
  const chunks: Buffer[] = [];
  const res: any = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  res.writeHead = vi.fn();
  res.body = () => Buffer.concat(chunks).toString();
  return res;
}

function response() {
  return {
    writeHead: vi.fn(),
    end: vi.fn(),
    headersSent: false,
  };
}

async function serve(urlPath: string, method = "GET") {
  const res = streamResponse();
  serveStaticAsset({ method } as any, res, urlPath);
  await finished(res);
  return res;
}

describe("isStaticAssetPath", () => {
  it("recognizes extensions on the last segment", () => {
    expect(isStaticAssetPath("/logo.png")).toBe(true);
    expect(isStaticAssetPath("/assets/app.css?x=1")).toBe(true);
    expect(isStaticAssetPath("/logo.PNG")).toBe(true);
    expect(isStaticAssetPath("/logo%2Epng")).toBe(true);
  });

  it("rejects extensionless paths", () => {
    expect(isStaticAssetPath("/")).toBe(false);
    expect(isStaticAssetPath("")).toBe(false);
    expect(isStaticAssetPath("/blog/post")).toBe(false);
    expect(isStaticAssetPath("/blog/post/")).toBe(false);
    expect(isStaticAssetPath("/a.b/c")).toBe(false);
    expect(isStaticAssetPath("/file.")).toBe(false);
    expect(isStaticAssetPath("/%E0%A4%A")).toBe(false);
  });
});

describe("serveStaticAsset", () => {
  it("streams a file with its content headers", async () => {
    write("public/hello.txt", "hello static");
    const res = await serve("/hello.txt");

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": 12,
      "Cache-Control": "no-store",
    });
    expect(res.body()).toBe("hello static");
  });

  it("ignores query strings and fragments", async () => {
    write("public/hello.txt", "hello");
    const res = await serve("/hello.txt?x=1");
    expect(res.body()).toBe("hello");
  });

  it("serves unknown extensions as octet-stream", async () => {
    write("public/data.bin", "binary");
    const res = await serve("/data.bin");
    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        "Content-Type": "application/octet-stream",
      })
    );
    expect(res.body()).toBe("binary");
  });

  it("supports HEAD without a body", async () => {
    write("public/hello.txt", "hello");
    const res = await serve("/hello.txt", "HEAD");
    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ "Content-Length": 5 })
    );
    expect(res.body()).toBe("");
  });

  it("returns 404 for a missing file", () => {
    write("public/hello.txt");
    const res = response();
    serveStaticAsset({ method: "GET" } as any, res as any, "/missing.txt");
    expect(res.writeHead).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledWith("Not found");
  });

  it("returns 404 when public does not exist", () => {
    const res = response();
    serveStaticAsset({ method: "GET" } as any, res as any, "/hello.txt");
    expect(res.writeHead).toHaveBeenCalledWith(404);
  });

  it("returns 404 for an empty path", () => {
    write("public/hello.txt");
    const res = response();
    serveStaticAsset({ method: "GET" } as any, res as any, "");
    expect(res.writeHead).toHaveBeenCalledWith(404);
  });

  it("rejects dotfiles", () => {
    write("public/.env", "SECRET=1");
    const res = response();
    serveStaticAsset({ method: "GET" } as any, res as any, "/.env");
    expect(res.writeHead).toHaveBeenCalledWith(404);
  });

  it("rejects malformed encodings", () => {
    write("public/hello.txt");
    const res = response();
    serveStaticAsset({ method: "GET" } as any, res as any, "/%E0%A4%A");
    expect(res.writeHead).toHaveBeenCalledWith(404);
  });

  it("rejects traversal and encoded separators", () => {
    write("secret.txt", "secret");
    write("public/hello.txt");
    const plain = response();
    serveStaticAsset({ method: "GET" } as any, plain as any, "/../secret.txt");
    expect(plain.writeHead).toHaveBeenCalledWith(404);

    const encoded = response();
    serveStaticAsset(
      { method: "GET" } as any,
      encoded as any,
      "/%2e%2e/secret.txt"
    );
    expect(encoded.writeHead).toHaveBeenCalledWith(404);

    const slash = response();
    serveStaticAsset({ method: "GET" } as any, slash as any, "/a%2Fb.txt");
    expect(slash.writeHead).toHaveBeenCalledWith(404);

    const backslash = response();
    serveStaticAsset({ method: "GET" } as any, backslash as any, "/a%5Cb.txt");
    expect(backslash.writeHead).toHaveBeenCalledWith(404);
  });

  it("rejects directories", () => {
    fs.mkdirSync(path.join(root, "public", "folder.png"), {
      recursive: true,
    });
    const res = response();
    serveStaticAsset({ method: "GET" } as any, res as any, "/folder.png");
    expect(res.writeHead).toHaveBeenCalledWith(404);
  });

  it("rejects symlinks that escape public", () => {
    write("secret.txt", "secret");
    write("public/hello.txt");
    fs.symlinkSync(
      path.join(root, "secret.txt"),
      path.join(root, "public", "link.txt")
    );
    const res = response();
    serveStaticAsset({ method: "GET" } as any, res as any, "/link.txt");
    expect(res.writeHead).toHaveBeenCalledWith(404);
  });

  it("allows symlinks inside public", async () => {
    write("public/real.txt", "real");
    fs.symlinkSync(
      path.join(root, "public", "real.txt"),
      path.join(root, "public", "alias.txt")
    );
    const res = await serve("/alias.txt");
    expect(res.body()).toBe("real");
  });

  it("serves built client assets with immutable caching", async () => {
    write(".nestly/client/app-abc123.js", "console.log('app')");
    const res = streamResponse();
    serveClientAsset({ method: "GET" } as any, res as any, "app-abc123.js");
    await finished(res);

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Content-Length": 18,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    expect(res.body()).toBe("console.log('app')");
  });

  it("returns 404 for a missing built client asset", () => {
    write(".nestly/client/app-abc123.js", "x");
    const res = response();
    serveClientAsset({ method: "GET" } as any, res as any, "missing.js");
    expect(res.writeHead).toHaveBeenCalledWith(404);
  });

  it("returns 500 when the stream fails before headers", () => {
    write("public/hello.txt", "hello");
    const stream: any = new EventEmitter();
    stream.pipe = vi.fn();
    vi.spyOn(fs, "createReadStream").mockReturnValue(stream);
    const res = response();

    serveStaticAsset({ method: "GET" } as any, res as any, "/hello.txt");
    stream.emit("error");

    expect(res.writeHead).toHaveBeenLastCalledWith(500);
    expect(res.end).toHaveBeenCalled();
  });

  it("ends the response when the stream fails after headers", () => {
    write("public/hello.txt", "hello");
    const stream: any = new EventEmitter();
    stream.pipe = vi.fn();
    vi.spyOn(fs, "createReadStream").mockReturnValue(stream);
    const res = { ...response(), headersSent: true };

    serveStaticAsset({ method: "GET" } as any, res as any, "/hello.txt");
    stream.emit("error");

    expect(res.writeHead).toHaveBeenCalledTimes(1);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(res.end).toHaveBeenCalled();
  });
});
