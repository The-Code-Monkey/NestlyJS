console.log(`[CHILD ${process.pid}] Booting API child worker`);

// Signal ready immediately
setImmediate(() => {
  console.log(`[CHILD ${process.pid}] READY to handle API requests`);
  process.send?.({ type: "ready" });
});

process.on(
  "message",
  async ({
    file,
    method,
    url,
    headers,
    body,
  }: {
    file: string;
    method: string;
    url: string;
    headers?: any;
    body?: any;
  }) => {
    try {
      console.log(`[CHILD ${process.pid}] Executing API: ${method} ${url}`);
      const apiModule = await import(file);
      const handler = apiModule.default || apiModule;
      const result = await handler({ method, url, headers, body });
      process.send?.({
        type: "apiResponse",
        status: result.status || 200,
        body: result.body,
      });
      console.log(`[CHILD ${process.pid}] Responded for API: ${method} ${url}`);
    } catch (err) {
      console.error(
        `[CHILD ${process.pid}] Error in API: ${method} ${url}`,
        err
      );
      process.send?.({
        type: "apiResponse",
        status: 500,
        body: { error: "Internal Server Error" },
      });
    }
  }
);
