import http from "http";

const PORT = 4000; // dev server port for testing

async function request(path: string, method: string = "GET") {
  return new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const req = http.request(
      { hostname: "localhost", port: PORT, path, method },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode || 0, body: data }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function runTests() {
  try {
    // Test SSR page
    const home = await request("/");
    if (!home.body.includes("<h1>")) throw new Error("SSR / failed");

    const about = await request("/about");
    if (!about.body.includes("<h1>About")) throw new Error("SSR /about failed");

    // Test API routes
    const apiGet = await request("/contact", "GET");
    const apiPost = await request("/contact", "POST");
    if (!apiGet.body.includes("Contact GET")) throw new Error("API GET /contact failed");
    if (!apiPost.body.includes("POST")) throw new Error("API POST /contact failed");

    console.log("All tests passed ✅");
    process.exit(0);
  } catch (err: any) {
    console.error("Test failed:", err.message);
    process.exit(1);
  }
}

runTests();
