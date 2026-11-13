import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { App } from "./App";
import "./styles.css";

if ("serviceWorker" in navigator && window.isSecureContext) {
  void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
    .catch((error: unknown) => console.warn("IMARA offline shell registration failed.", error));
}

const STALE_ASSET_RELOAD_KEY = "imara:stale-asset-reload";
try {
  if (window.sessionStorage.getItem(STALE_ASSET_RELOAD_KEY) === "true") {
    window.setTimeout(() => window.sessionStorage.removeItem(STALE_ASSET_RELOAD_KEY), 60_000);
  }
} catch {
  // Continue without automatic stale-asset recovery when session storage is disabled.
}
window.addEventListener("vite:preloadError", (event) => {
  let shouldReload = false;
  try {
    shouldReload = window.sessionStorage.getItem(STALE_ASSET_RELOAD_KEY) !== "true";
    if (shouldReload) {
      window.sessionStorage.setItem(STALE_ASSET_RELOAD_KEY, "true");
    }
  } catch {
    shouldReload = false;
  }
  if (!shouldReload) return;
  event.preventDefault();
  window.location.reload();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 20_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
