import http from "http";

const PORT = 4000; // dev server port for testing

async function request(
  path: string,
  method: string = "GET",
  body?: string
) {
  return new Promise<{
    statusCode: number;
    body: string;
    headers: http.IncomingHttpHeaders;
  }>((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: PORT,
        path,
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({
            statusCode: res.statusCode || 0,
            body: data,
            headers: res.headers,
          })
        );
      }
    );
    req.on("error", reject);
    req.end(body);
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
      const stylesheet = css.body.match(
        /href="(\/_nestly\/client\/[^"]+\.css)"/
      );
      if (!stylesheet) throw new Error("CSS bundle failed");
      const asset = await request(stylesheet[1]);
      if (!asset.body.includes("color: rebeccapurple")) {
        throw new Error("CSS asset failed");
      }
    }

    const apiPost = await request("/", "POST");
    if (!apiPost.body.includes("POST received")) {
      throw new Error("API POST / failed");
    }

    const apiBody = await request("/", "POST", '{"value":1}');
    if (!apiBody.body.includes('"value":1')) {
      throw new Error("API POST body parsing failed");
    }

    const apiInvalid = await request("/", "POST", "{");
    if (apiInvalid.statusCode !== 400) {
      throw new Error("API invalid JSON must return 400");
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

    const moduleScript = home.body.match(
      /<script type="module" src="([^"]+)">/
    );
    if (moduleScript) {
      const scriptAsset = await request(moduleScript[1]);
      if (scriptAsset.statusCode !== 200) {
        throw new Error("Client script asset failed");
      }
      if (!scriptAsset.headers["content-type"]?.includes("javascript")) {
        throw new Error("Client script content type failed");
      }
    }

    const staticFile = await request("/hello.txt");
    if (staticFile.statusCode !== 200) {
      throw new Error("Static file /hello.txt failed");
    }
    if (staticFile.body.trim() !== "hello static") {
      throw new Error("Static file body failed");
    }
    if (!staticFile.headers["content-type"]?.includes("text/plain")) {
      throw new Error("Static file content type failed");
    }

    const staticHead = await request("/hello.txt", "HEAD");
    if (staticHead.statusCode !== 200 || staticHead.body !== "") {
      throw new Error("Static HEAD /hello.txt failed");
    }

    const staticQuery = await request("/hello.txt?v=1");
    if (staticQuery.body.trim() !== "hello static") {
      throw new Error("Static query string failed");
    }

    const missingStatic = await request("/missing.png");
    if (missingStatic.statusCode !== 404) {
      throw new Error("Missing static file must not fall back to routes");
    }

    const staticLikeRoute = await request("/blog/asset.png");
    if (staticLikeRoute.statusCode !== 404) {
      throw new Error("Static-like URL must not match catch-all route");
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
