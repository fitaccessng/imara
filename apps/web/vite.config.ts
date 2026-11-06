import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq) => proxyReq.removeHeader("origin"));
          proxy.on("error", (error, _request, response) => {
            console.error("API proxy connection failed:", error.message);
            if ("writeHead" in response && !response.headersSent) {
              response.writeHead(503, { "Content-Type": "application/json" });
              response.end(JSON.stringify({
                message: "The IMARA API is unavailable. Start it with `npm run dev:api` and confirm it is listening on port 3001.",
              }));
            }
          });
        },
      },
    },
  },
});
