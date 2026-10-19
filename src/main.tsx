import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Dev builds skip the service worker: its cache-first script handling would
// keep serving stale modules across dev-server restarts.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed", error);
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
