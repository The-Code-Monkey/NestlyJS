process.on("message", async (msg) => {
  const { url, method, headers } = msg ?? {};

  // Example API response
  const response = {
    message: "Hello from API child",
    url,
    method,
    headers
  };

  process.send?.({ body: response, status: 200 });
});
