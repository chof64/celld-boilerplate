import { defineConfig } from "waku/config";

const backend = "http://127.0.0.1:9876";

export default defineConfig({
  vite: {
    server: {
      port: 3000,
      // celld writes .celld/dev continuously (leases, reload state); without
      // this, every write retriggers pages.gen.ts typegen, whose mtime bump
      // makes celld rebuild -> infinite dev loop when both run together.
      watch: { ignored: ["**/.celld/**"] },
      proxy: {
        "/api": { target: backend, changeOrigin: true, ws: true },
        "/health": { target: backend, changeOrigin: true },
      },
    },
  },
});
