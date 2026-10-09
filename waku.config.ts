import { defineConfig } from "waku/config";

const backend = "http://127.0.0.1:9876";

export default defineConfig({
  vite: {
    server: {
      port: 3000,
      proxy: {
        "/api": { target: backend, changeOrigin: true, ws: true },
        "/health": { target: backend, changeOrigin: true },
      },
    },
  },
});
