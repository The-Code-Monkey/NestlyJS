import React from "react";
import ReactDOM from "react-dom/client";

window.React = React;
import React from "react";
import ReactDOM from "react-dom/client";

declare global {
  interface Window {
    React: typeof React;
    ReactDOMClient: typeof ReactDOMClient;
    __components: Record<string, React.ComponentType<any>>;
  }
}

window.React = React;
window.ReactDOMClient = ReactDOM;
