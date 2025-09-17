import tsNode from "ts-node";

// Enable TS support
tsNode.register({ transpileOnly: true, compilerOptions: { module: "commonjs" } });

process.on("message", async (msg) => {
  const { file, method, url, headers, body } = msg;

  try {
    const apiModule = require(file);

    // Uppercase method required by convention
    const apiFunc = apiModule[method.toUpperCase()];

    if (typeof apiFunc !== "function") {
      process.send?.({ body: { message: "Method not allowed" }, status: 405 });
      return;
    }

    // Mock request/response objects
    const req = { url, method, headers, body };
    const res = {
      json: (data: any) => process.send?.({ body: data, status: 200 }),
      status: (code: number) => ({ json: (data: any) => process.send?.({ body: data, status: code }) }),
    };

    await apiFunc(req, res);
  } catch (err) {
    console.error("API Child error:", err);
    process.send?.({ body: { message: "Internal server error" }, status: 500 });
  }
});
