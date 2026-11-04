import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { bundleClientScript, getDevPreamble } from "../src/devRefresh";

let root: string;
let dom: JSDOM;

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe("fast refresh spike", () => {
  beforeAll(async () => {
    root = fs.mkdtempSync(
      path.join(process.cwd(), "packages/server/test", "tmp-refresh-")
    );
    dom = new JSDOM(
      '<!doctype html><html><body><div id="root"></div></body></html>',
      { url: "http://localhost", runScripts: "dangerously" }
    );

    dom.window.eval(await getDevPreamble());
  });

  afterAll(() => {
    dom.window.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("preserves component state across a refresh", async () => {
    const componentFile = path.join(root, "Counter.tsx");
    const version = (label: string) => `import React, { useState } from "react";
export default function Counter() {
  const [count, setCount] = useState(0);
  return React.createElement(
    "button",
    { onClick: () => setCount((value) => value + 1) },
    "${label}:" + count
  );
}
`;

    fs.writeFileSync(componentFile, version("one"));

    const initial = await bundleClientScript([
      { id: "Counter", filePath: componentFile },
    ]);
    dom.window.eval(initial.js);
    dom.window.eval(`
      window.__root = window.ReactDOMClient.createRoot(
        document.getElementById("root")
      );
      window.ReactDOM.flushSync(() => {
        window.__root.render(
          window.React.createElement(window.__components["Counter"].default)
        );
      });
    `);

    const button = dom.window.document.querySelector("button")!;
    expect(button.textContent).toBe("one:0");

    button.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true })
    );
    await tick();
    expect(button.textContent).toBe("one:1");

    fs.writeFileSync(componentFile, version("two"));
    const updated = await bundleClientScript([
      { id: "Counter", filePath: componentFile },
    ]);

    dom.window.eval(updated.js);
    (dom.window as any).__NESTLY_REFRESH__.performReactRefresh();
    await tick();

    expect(button.textContent).toBe("two:1");
  });
});
