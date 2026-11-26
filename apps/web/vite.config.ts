import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3001",
          changeOrigin: true,
          configure(proxy) {
            proxy.on("proxyReq", (proxyReq) => proxyReq.removeHeader("origin"));
            proxy.on("error", (error, _request, response) => {
              console.error("API proxy connection failed:", error.message);
              if ("writeHead" in response && !response.headersSent) {
                response.writeHead(503, { "Content-Type": "application/json" });
                response.end(JSON.stringify({
                  message: "The IMARA API is unavailable. Check the configured API proxy target and try again.",
                }));
              }
            });
          },
        },
      },
    },
  };
});
