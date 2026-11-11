import { describe, it, expect, vi } from "vitest";
import {
  decideRequest,
  notFoundResponse,
  type RouteResolution,
} from "../src/requestPipeline";

function lookupReturning(match: RouteResolution<string> | null) {
  return vi.fn(() => match);
}

const pageRoute: RouteResolution<string> = {
  route: "page",
  params: { slug: "hello" },
  hasPage: true,
  hasApi: true,
};

describe("decideRequest", () => {
  it("decides client assets by prefix", () => {
    const lookup = lookupReturning(null);

    const get = decideRequest("/_nestly/client/app.js?v=1", "GET", lookup);
    const head = decideRequest("/_nestly/client/app.js", "HEAD", lookup);

    expect(get.kind).toBe("clientAsset");
    expect(get.assetPath).toBe("app.js");
    expect(head.kind).toBe("clientAsset");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("decides static assets by extension before route lookup", () => {
    const lookup = lookupReturning(null);

    const decision = decideRequest("/logo.png?v=1", "GET", lookup);

    expect(decision.kind).toBe("staticAsset");
    expect(decision.path).toBe("/logo.png");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps a static-looking missing file out of routes", () => {
    const lookup = lookupReturning(pageRoute);

    expect(decideRequest("/blog/asset.png", "GET", lookup).kind).toBe(
      "staticAsset"
    );
    expect(decideRequest("/blog/asset.png", "POST", lookup).kind).toBe(
      "notFound"
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns not found for non-GET client assets", () => {
    const lookup = lookupReturning(pageRoute);

    expect(
      decideRequest("/_nestly/client/app.js", "POST", lookup).kind
    ).toBe("notFound");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("prefers a page over an API route on GET", () => {
    const lookup = lookupReturning(pageRoute);

    const decision = decideRequest("/blog/hello", "GET", lookup);

    expect(decision.kind).toBe("page");
    expect(decision.route).toBe("page");
    expect(decision.params).toEqual({ slug: "hello" });
  });

  it("decides an API-only route on GET", () => {
    const lookup = lookupReturning({
      route: "api",
      params: {},
      hasPage: false,
      hasApi: true,
    });

    expect(decideRequest("/hooks", "GET", lookup).kind).toBe("api");
  });

  it("decides an API route on non-GET methods", () => {
    const lookup = lookupReturning({
      route: "api",
      params: { id: "1" },
      hasPage: false,
      hasApi: true,
    });

    const decision = decideRequest("/hooks/1", "post", lookup);

    expect(decision.kind).toBe("api");
    expect(decision.method).toBe("POST");
    expect(decision.params).toEqual({ id: "1" });
    expect(decision.url).toBe("/hooks/1");
  });

  it("returns not found for a non-GET page-only route", () => {
    const lookup = lookupReturning({
      route: "page",
      params: {},
      hasPage: true,
      hasApi: false,
    });

    expect(decideRequest("/blog", "POST", lookup).kind).toBe("notFound");
  });

  it("returns not found for a HEAD page-only route", () => {
    const lookup = lookupReturning({
      route: "page",
      params: {},
      hasPage: true,
      hasApi: false,
    });

    expect(decideRequest("/blog", "HEAD", lookup).kind).toBe("notFound");
  });

  it("strips query and fragment for lookup but keeps the original URL", () => {
    const lookup = lookupReturning(pageRoute);

    const decision = decideRequest(
      "/blog/hello?tab=a#section",
      "GET",
      lookup
    );

    expect(lookup).toHaveBeenCalledWith("/blog/hello");
    expect(decision.path).toBe("/blog/hello");
    expect(decision.url).toBe("/blog/hello?tab=a#section");
  });

  it("passes route-group params through without a URL segment", () => {
    const lookup = lookupReturning({
      route: "page",
      params: {},
      hasPage: true,
      hasApi: false,
    });

    const decision = decideRequest("/about", "GET", lookup);

    expect(decision.kind).toBe("page");
    expect(decision.params).toEqual({});
  });

  it("passes catch-all params through as arrays", () => {
    const lookup = lookupReturning({
      route: "page",
      params: { rest: ["a", "b"] },
      hasPage: true,
      hasApi: false,
    });

    const decision = decideRequest("/docs/a/b", "GET", lookup);

    expect(decision.kind).toBe("page");
    expect(decision.params).toEqual({ rest: ["a", "b"] });
  });

  it("passes optional catch-all params through as undefined", () => {
    const lookup = lookupReturning({
      route: "page",
      params: { slug: undefined },
      hasPage: true,
      hasApi: false,
    });

    const decision = decideRequest("/docs", "GET", lookup);

    expect(decision.kind).toBe("page");
    expect(decision.params).toHaveProperty("slug", undefined);
  });

  it("passes decoded params from the route adapter", () => {
    const lookup = lookupReturning({
      route: "page",
      params: { slug: "hello world" },
      hasPage: true,
      hasApi: false,
    });

    expect(
      decideRequest("/blog/hello%20world", "GET", lookup).params
    ).toEqual({ slug: "hello world" });
  });

  it("returns not found for malformed and traversal paths", () => {
    const lookup = lookupReturning(pageRoute);

    for (const url of [
      "/%E0%A4%A",
      "/%2e%2e/secret",
      "/./secret",
      "/a%2Fb",
      "/a%5Cb",
      "/%2e%2e/logo.png",
    ]) {
      expect(decideRequest(url, "GET", lookup).kind, url).toBe("notFound");
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns not found when no route matches", () => {
    const lookup = lookupReturning(null);

    expect(decideRequest("/missing", "GET", lookup).kind).toBe("notFound");
    expect(decideRequest("/missing", "POST", lookup).kind).toBe("notFound");
  });
});

describe("notFoundResponse", () => {
  it("uses the page message for GET", () => {
    expect(notFoundResponse("GET")).toEqual({
      status: 404,
      body: "Page not found",
    });
  });

  it("uses the API message for other methods", () => {
    expect(notFoundResponse("post")).toEqual({
      status: 404,
      body: "API route not found",
    });
  });
});
