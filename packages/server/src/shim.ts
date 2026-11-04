import React from "react";
import * as ReactDOMClient from "react-dom/client";

declare global {
  interface Window {
    React: typeof React;
    ReactDOMClient: typeof ReactDOMClient;
    __components: Record<string, { default: React.ComponentType<any> }>;
  }
}

window.React = React;
window.ReactDOMClient = ReactDOMClient;
