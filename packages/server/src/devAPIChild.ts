import type { RouteParams } from "./routePatterns";

console.log(`[CHILD ${process.pid}] Booting API child worker`);

export interface ApiMessage {
  file: string;
  method: string;
  url: string;
  headers?: any;
  body?: any;
  bodyError?: { status: number; message: string };
  params?: RouteParams;
  requestId?: string;
}

export async function handleApiMessage(
  {
    file,
    method,
    url,
    headers,
    body,
    bodyError,
    params,
    requestId,
  }: ApiMessage,
  send: (msg: any) => void = process.send?.bind(process) ?? (() => {})
) {
  const pid = process.pid;
  try {
    console.log(`[CHILD ${pid}] Executing API: ${method} ${url}`);
    const apiModule = await import(file);
    const handler = apiModule?.[method];
    if (typeof handler !== "function") {
      send({ type: "apiNotFound", requestId });
      return;
    }
    if (bodyError) {
      send({
        type: "apiResponse",
        status: bodyError.status,
        body: { error: bodyError.message },
        requestId,
      });
      return;
    }
    const result = await handler({ method, url, headers, body, params });
    if (!result) {
      throw new Error(`Method ${method} in ${file} did not return a result`);
    }
    send({
      type: "apiResponse",
      status: result.status || 200,
      body: result.body,
      requestId,
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
      requestId,
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
