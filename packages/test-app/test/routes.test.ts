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

    const dynamicPage = await request("/blog/hello");
    if (!dynamicPage.body.includes("Post hello")) {
      throw new Error("Dynamic page /blog/[slug] failed");
    }
    if (!dynamicPage.body.includes("data-blog-layout")) {
      throw new Error("Dynamic layout /blog/[slug] failed");
    }

    const dynamicQuery = await request("/blog/hello?x=1");
    if (!dynamicQuery.body.includes("Post hello")) {
      throw new Error("Dynamic page with query failed");
    }

    const staticPage = await request("/blog/archive");
    if (!staticPage.body.includes("Blog Archive")) {
      throw new Error("Static route precedence failed");
    }

    const dynamicApi = await request("/blog/hello", "POST");
    if (!dynamicApi.body.includes('"slug":"hello"')) {
      throw new Error("Dynamic API /blog/[slug] failed");
    }

    const catchAllPage = await request("/blog/a/b");
    if (!catchAllPage.body.includes("Catch a/b")) {
      throw new Error("Catch-all page /blog/[...rest] failed");
    }

    const optionalEmpty = await request("/docs");
    if (!optionalEmpty.body.includes("Docs home")) {
      throw new Error("Optional catch-all empty /docs failed");
    }

    const optionalNested = await request("/docs/guides/setup");
    if (!optionalNested.body.includes("Docs guides/setup")) {
      throw new Error("Optional catch-all nested /docs/[[...slug]] failed");
    }

    const groupPage = await request("/about");
    if (!groupPage.body.includes("About Marketing")) {
      throw new Error("Route group /(marketing)/about failed");
    }
    if (!groupPage.body.includes("data-marketing-layout")) {
      throw new Error("Route group layout failed");
    }

    const groupNotInUrl = await request("/marketing");
    if (groupNotInUrl.statusCode !== 404) {
      throw new Error("Route group must not add a URL segment");
    }

    const catchAllApi = await request("/files/a/b", "POST");
    if (!catchAllApi.body.includes('"path":["a","b"]')) {
      throw new Error("Catch-all API /files/[...path] failed");
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
