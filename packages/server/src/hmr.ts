import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import type { IncomingMessage, ServerResponse } from "http";
import { resolveRoute } from "./routeResolver";
import { collectCss, findLayoutComponents } from "./renderer";

export const HMR_PATH = "/_nestly/hmr";

const clients = new Map<ServerResponse, string>();
let watcherStarted = false;
let keepalive: NodeJS.Timeout | null = null;

export const hmrClientScript = `
      <script>
      (function() {
        if (!window.EventSource) return;
        const source = new EventSource(
          "${HMR_PATH}?path=" + encodeURIComponent(location.pathname + location.search)
        );
        source.onmessage = (event) => {
          const message = JSON.parse(event.data);
          if (message.type === "reload") {
            location.reload();
          } else if (message.type === "css") {
            let style = document.querySelector("style[data-nestly-style]");
            if (!style) {
              style = document.createElement("style");
              style.setAttribute("data-nestly-style", "");
              document.head.appendChild(style);
            }
            style.textContent = message.css;
          }
        };
      })();
      </script>`;

function send(res: ServerResponse, payload: unknown) {
  if (res.writableEnded) {
    clients.delete(res);
    return;
  }
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function ensureKeepalive() {
  if (keepalive) return;
  keepalive = setInterval(() => {
    for (const res of clients.keys()) {
      if (res.writableEnded) clients.delete(res);
      else res.write(": ping\n\n");
    }
  }, 15000);
  keepalive.unref();
}

export function hmrHandler(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("retry: 1000\n\n");

  const url = new URL(req.url || HMR_PATH, "http://localhost");
  clients.set(res, url.searchParams.get("path") || "/");
  res.on("close", () => clients.delete(res));
  ensureKeepalive();
}

export async function collectCssForUrl(urlPath: string) {
  const route = resolveRoute(urlPath);
  if (!route || !fs.existsSync(route.pageFile)) return "";

  const layoutPaths = await findLayoutComponents(
    route.pageFile.replace("page.tsx", "")
  );
  const seen = new Set<string>();
  const files = [
    ...layoutPaths.flatMap((layoutPath) =>
      collectCss(layoutPath, undefined, false)
    ),
    ...collectCss(route.pageFile, undefined, false),
  ].filter((file) => !seen.has(file) && seen.add(file) && fs.existsSync(file));

  return files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
}

async function broadcastCss() {
  for (const [res, urlPath] of clients) {
    send(res, { type: "css", css: await collectCssForUrl(urlPath) });
  }
}

function broadcastReload(filePath: string) {
  for (const res of clients.keys()) {
    send(res, { type: "reload", path: filePath });
  }
}

export function handleChange(filePath: string) {
  const routesDir = path.join(process.cwd(), "routes");
  if (filePath.endsWith(".css") && filePath.startsWith(routesDir + path.sep)) {
    void broadcastCss();
  } else {
    broadcastReload(filePath);
  }
}

export function startHmrWatcher() {
  if (watcherStarted) return;
  watcherStarted = true;

  chokidar
    .watch(
      [
        path.join(process.cwd(), "routes"),
        path.join(process.cwd(), "public"),
      ],
      { ignoreInitial: true }
    )
    .on("all", (_event, filePath) => {
      if (filePath) handleChange(filePath);
    });
}
