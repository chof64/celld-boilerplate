import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:9876",
        ws: true,
      },
      "/health": {
        target: "http://127.0.0.1:9876",
      },
    },
  },
});
