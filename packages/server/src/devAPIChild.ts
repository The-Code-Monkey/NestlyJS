process.on("message", async (msg) => {
  const { url, method, headers } = msg;

  // Example API response for dev
  const response = {
    message: "Hello from Dev API child",
    url,
    method,
    headers,
    timestamp: Date.now(),
  };

  process.send({ body: response, status: 200 });
});
