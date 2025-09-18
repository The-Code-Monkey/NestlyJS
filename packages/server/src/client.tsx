import React from "react";
import { hydrateRoot } from "react-dom/client";

// Find all SSR-rendered client-only components
document
  .querySelectorAll<HTMLElement>("[data-use-client='true']")
  .forEach((el) => {
    const modulePath = el.dataset.component;
    if (!modulePath) return;

    // Native ESM import in browser
    import(modulePath)
      .then((mod) => {
        const Component = mod.default;
        hydrateRoot(el, <Component />);
      })
      .catch((err) => {
        console.error("Failed to hydrate client component:", modulePath, err);
      });
  });
