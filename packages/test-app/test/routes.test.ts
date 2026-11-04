import http from "http";

const PORT = 4000; // dev server port for testing

async function request(path: string, method: string = "GET") {
  return new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const req = http.request(
      { hostname: "localhost", port: PORT, path, method },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({ statusCode: res.statusCode || 0, body: data })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function runTests() {
  try {
    const home = await request("/");
    if (!home.body.includes("Welcome to the Test App!")) {
      throw new Error("SSR / failed");
    }

    const withQuery = await request("/?x=1");
    if (!withQuery.body.includes("Welcome to the Test App!")) {
      throw new Error("SSR /?x=1 failed");
    }

    const css = await request("/");
    if (!css.body.includes("color: rebeccapurple")) {
      throw new Error("CSS bundle failed");
    }

    const apiPost = await request("/", "POST");
    if (!apiPost.body.includes("POST received")) {
      throw new Error("API POST / failed");
    }

    const apiPut = await request("/", "PUT");
    if (!apiPut.body.includes("PUT received")) {
      throw new Error("API PUT / failed");
    }

    const missing = await request("/missing");
    if (missing.statusCode !== 404) throw new Error("404 /missing failed");

    console.log("All tests passed ✅");
    process.exit(0);
  } catch (err: any) {
    console.error("Test failed:", err.message);
    process.exit(1);
  }
}

runTests();
