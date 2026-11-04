import fs from "fs";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import type { Stats } from "fs";

const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  pdf: "application/pdf",
  wasm: "application/wasm",
  mp4: "video/mp4",
  webm: "video/webm",
};

interface StaticFile {
  filePath: string;
  size: number;
  contentType: string;
}

function cleanUrlPath(urlPath: string) {
  return urlPath.split(/[?#]/)[0] || "/";
}

/**
 * Static assets are recognized by a file extension on the last URL segment.
 * Application routes never use file extensions.
 */
export function isStaticAssetPath(urlPath: string) {
  const cleanPath = cleanUrlPath(urlPath);
  const rawSegment = cleanPath.split("/").filter(Boolean).pop() || "";

  let lastSegment: string;
  try {
    lastSegment = decodeURIComponent(rawSegment);
  } catch {
    return false;
  }

  return /\.[A-Za-z0-9]+$/.test(lastSegment);
}

function resolveStaticFile(rootPath: string, urlPath: string): StaticFile | null {
  const cleanPath = cleanUrlPath(urlPath);

  let segments: string[];
  try {
    segments = cleanPath
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }

  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment.startsWith(".") ||
        segment.includes("/") ||
        segment.includes("\\") ||
        segment.includes("\0")
    )
  ) {
    return null;
  }

  let publicRoot: string;
  try {
    publicRoot = fs.realpathSync(rootPath);
  } catch {
    return null;
  }

  const candidate = path.resolve(publicRoot, ...segments);

  let realFile: string;
  let stat: Stats;
  try {
    realFile = fs.realpathSync(candidate);
    stat = fs.statSync(realFile);
  } catch {
    return null;
  }
  if (!realFile.startsWith(publicRoot + path.sep)) return null;
  if (!stat.isFile()) return null;

  const extension = path.extname(realFile).slice(1).toLowerCase();
  return {
    filePath: realFile,
    size: stat.size,
    contentType: MIME_TYPES[extension] ?? "application/octet-stream",
  };
}

/**
 * Serves a file from the app's public directory. Always responds: a static
 * path with no matching file is a 404, never a route fallback.
 */
export function serveStaticAsset(
  req: IncomingMessage,
  res: ServerResponse,
  urlPath: string
) {
  serveFile(
    req,
    res,
    resolveStaticFile(path.join(process.cwd(), "public"), urlPath),
    "no-store"
  );
}

function serveFile(
  req: IncomingMessage,
  res: ServerResponse,
  file: StaticFile | null,
  cacheControl: string
) {
  if (!file) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": file.contentType,
    "Content-Length": file.size,
    "Cache-Control": cacheControl,
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const stream = fs.createReadStream(file.filePath);
  stream.on("error", () => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
  stream.pipe(res);
}

/**
 * Serves a hashed production asset from `.nestly/client`.
 */
export function serveClientAsset(
  req: IncomingMessage,
  res: ServerResponse,
  urlPath: string
) {
  serveFile(
    req,
    res,
    resolveStaticFile(path.join(process.cwd(), ".nestly", "client"), urlPath),
    "public, max-age=31536000, immutable"
  );
}
