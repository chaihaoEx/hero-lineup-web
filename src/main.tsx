import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

function registerOfflineSupport() {
  const register = () => {
    void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
  };
  const requestIdle = (window as unknown as {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  }).requestIdleCallback;
  if (requestIdle) {
    requestIdle(register, { timeout: 3_000 });
  } else {
    globalThis.setTimeout(register, 1_500);
  }
}

if (document.readyState === "complete") registerOfflineSupport();
else window.addEventListener("load", registerOfflineSupport, { once: true });
