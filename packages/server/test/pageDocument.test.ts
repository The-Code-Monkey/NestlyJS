import { describe, it, expect } from "vitest";
import {
  clientInstanceKey,
  hydrationRootId,
  renderPageDocument,
  serializeProps,
  type PageDocumentAssets,
  type RenderedPage,
} from "../src/pageDocument";
import type { ClientInstance } from "../src/renderer";

const pageShell =
  "<html><head><title>Page</title></head><body><main>Hello</main></body></html>";

const instance: ClientInstance = {
  id: "routes/client.tsx",
  instanceKey: "routes-client.tsx-0",
  props: { label: "Go" },
};

function rendered(
  html = pageShell,
  instances: ClientInstance[] = []
): RenderedPage {
  return { html, instances };
}

const devAssets: PageDocumentAssets = {
  head: "<style data-nestly-style>body{color:black}</style>",
  body: '<script type="module">window.__bundle = true</script>',
  trailingBody: '<script src="/_nestly/hmr"></script>',
};

const productionAssets: PageDocumentAssets = {
  head: '<link rel="stylesheet" href="/_nestly/client/page.css">',
  body: '<script type="module" src="/_nestly/client/page.js"></script>',
};

describe("hydration markup", () => {
  it("owns the instance key and root id format", () => {
    expect(clientInstanceKey("routes/client.tsx", 2)).toBe(
      "routes-client.tsx-2"
    );
    expect(hydrationRootId("routes-client.tsx-2")).toBe(
      "hydrate-routes-client.tsx-2"
    );
  });

  it("serializes the root id into the hydration script", () => {
    const document = renderPageDocument(rendered(pageShell, [instance]), {});

    expect(document).toContain('rootId":"hydrate-routes-client.tsx-0"');
    expect(document).toContain('getElementById(rootId)');
  });
});

describe("renderPageDocument", () => {
  it("returns the rendered markup untouched when there are no assets", () => {
    const document = renderPageDocument(rendered(), {});

    expect(document).toBe(pageShell);
    expect(document).not.toContain("<style");
    expect(document).not.toContain("<script");
    expect(document).not.toContain("hydrate-");
  });

  it("injects style-only assets without a script", () => {
    const document = renderPageDocument(rendered(), {
      head: "<style>body{}</style>",
    });

    expect(document).toContain("<head><title>Page</title><style>body{}</style></head>");
    expect(document).not.toContain("<script");
  });

  it("injects script-only assets without hydration when no client rendered", () => {
    const document = renderPageDocument(rendered(), {
      body: '<script type="module" src="/page.js"></script>',
    });

    expect(document).toContain(
      '<body><main>Hello</main><script type="module" src="/page.js"></script></body>'
    );
    expect(document).not.toContain("hydrate-");
  });

  it("injects the page script before hydration, exactly once", () => {
    const document = renderPageDocument(rendered(pageShell, [instance]), {
      body: '<script type="module" src="/page.js"></script>',
    });

    expect(document.indexOf('src="/page.js"')).toBeLessThan(
      document.indexOf("hydrate-")
    );
    expect(document.match(/hydrate-/g)).toHaveLength(1);
    expect(document).toContain("routes/client.tsx");
    expect(document).toContain("Go");
  });

  it("injects style, page script, and hydration together", () => {
    const document = renderPageDocument(rendered(pageShell, [instance]), {
      head: "<style>body{}</style>",
      body: '<script type="module" src="/page.js"></script>',
    });

    expect(document).toContain("<style>body{}</style></head>");
    expect(document.indexOf('src="/page.js"')).toBeLessThan(
      document.indexOf("hydrate-")
    );
    expect(document.indexOf("hydrate-")).toBeLessThan(
      document.indexOf("</body>")
    );
  });

  it("orders the dev plan as page script, hydration, then the HMR client", () => {
    const document = renderPageDocument(rendered(pageShell, [instance]), devAssets);

    const script = document.indexOf("window.__bundle");
    const hydration = document.indexOf("hydrate-");
    const hmr = document.indexOf("/_nestly/hmr");

    expect(script).toBeGreaterThan(-1);
    expect(script).toBeLessThan(hydration);
    expect(hydration).toBeLessThan(hmr);
    expect(document).toContain("data-nestly-style");
    expect(document).not.toContain("<link");
  });

  it("orders the production plan as hashed style, module script, then hydration", () => {
    const document = renderPageDocument(
      rendered(pageShell, [instance]),
      productionAssets
    );

    const style = document.indexOf('<link rel="stylesheet"');
    const script = document.indexOf('src="/_nestly/client/page.js"');
    const hydration = document.indexOf("hydrate-");

    expect(style).toBeGreaterThan(-1);
    expect(script).toBeGreaterThan(-1);
    expect(style).toBeLessThan(document.indexOf("</head>"));
    expect(script).toBeLessThan(hydration);
    expect(document).not.toContain("data-nestly-style");
  });

  it("feeds one rendered page through both plans with the same skeleton", () => {
    const page = rendered(pageShell, [instance]);
    const dev = renderPageDocument(page, devAssets);
    const production = renderPageDocument(page, productionAssets);

    for (const document of [dev, production]) {
      expect(document).toContain("<main>Hello</main>");
      expect(document.match(/hydrate-/g)).toHaveLength(1);
      expect(document.indexOf("hydrate-")).toBeLessThan(
        document.indexOf("</body>")
      );
    }

    expect(dev).toContain("data-nestly-style");
    expect(production).toContain('<link rel="stylesheet"');
    expect(dev).not.toContain('<link rel="stylesheet"');
    expect(production).not.toContain("data-nestly-style");
  });

  it("falls back when the rendered page has no head or body tag", () => {
    const withHead = renderPageDocument(rendered("<p>page</p>", [instance]), {
      head: "<style>body{}</style>",
      body: "<script>page()</script>",
    });

    expect(withHead.startsWith("<style>body{}</style>")).toBe(true);
    expect(withHead).toContain("<p>page</p>");

    const withoutHead = renderPageDocument(rendered("<p>page</p>"), {
      head: "<style>body{}</style>",
    });
    expect(withoutHead).toBe("<style>body{}</style><p>page</p>");

    const withoutBody = renderPageDocument(rendered("<p>page</p>"), {
      body: "<script>page()</script>",
    });
    expect(withoutBody).toBe("<p>page</p><script>page()</script>");
  });

  it("appends trailing body markup even without a page script", () => {
    const document = renderPageDocument(rendered(), {
      trailingBody: '<script src="/_nestly/hmr"></script>',
    });

    expect(document).toContain(
      '<body><main>Hello</main><script src="/_nestly/hmr"></script></body>'
    );
    expect(document).not.toContain("hydrate-");
  });

  it("serializes hydration props safely", () => {
    expect(serializeProps(null)).toBe("{}");
    expect(serializeProps({ html: "</script>" })).toContain("\\u003c");

    const document = renderPageDocument(
      rendered(pageShell, [
        {
          id: "routes/client.tsx",
          instanceKey: "routes-client.tsx-0",
          props: { html: "</script>" },
        },
      ]),
      {}
    );
    expect(document).not.toContain("</script></script>");
    expect(document).toContain("\\u003c/script>");
  });
});
