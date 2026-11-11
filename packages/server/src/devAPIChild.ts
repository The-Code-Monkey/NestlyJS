import type { RouteParams } from "./routePatterns";

console.log(`[CHILD ${process.pid}] Booting API child worker`);

export interface ApiMessage {
  file: string;
  method: string;
  url: string;
  headers?: any;
  body?: any;
  params?: RouteParams;
}

export async function handleApiMessage(
  { file, method, url, headers, body, params }: ApiMessage,
  send: (msg: any) => void = process.send?.bind(process) ?? (() => {})
) {
  const pid = process.pid;
  try {
    console.log(`[CHILD ${pid}] Executing API: ${method} ${url}`);
    const apiModule = await import(file);
    const handler = apiModule?.[method];
    if (!handler) {
      throw new Error(`Method ${method} not found in ${file}`);
    }
    if (typeof handler !== "function") {
      throw new Error(`Method ${method} in ${file} is not a function`);
    }
    const result = await handler({ method, url, headers, body, params });
    if (!result) {
      throw new Error(`Method ${method} in ${file} did not return a result`);
    }
    send({
      type: "apiResponse",
      status: result.status || 200,
      body: result.body,
    });
    console.log(`[CHILD ${pid}] Responded for API: ${method} ${url}`);
  } catch (err) {
    console.error(
      `[CHILD ${pid}] Error in API: ${method} ${url}`,
      err
    );
    send({
      type: "apiResponse",
      status: 500,
      body: {
        error: `[CHILD ${pid}] Error in API: ${method} ${url} ${err}`,
      },
    });
  }
}

/* v8 ignore start */
if (require.main === module) {
  setImmediate(() => {
    console.log(`[CHILD ${process.pid}] READY to handle API requests`);
    process.send?.({ type: "ready" });
  });

  process.on("message", (msg: ApiMessage) => {
    void handleApiMessage(msg);
  });
}
/* v8 ignore stop */
