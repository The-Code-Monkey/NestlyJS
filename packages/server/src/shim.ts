import React from "react";
import ReactDOM from "react-dom/client";

window.React = React;
import React from "react";
import ReactDOM from "react-dom/client";

declare global {
  interface Window {
    React: typeof React;
    ReactDOMClient: typeof ReactDOM;
    __components?: Record<string, any>;
  }
}

window.React = React;
window.ReactDOMClient = ReactDOM;
