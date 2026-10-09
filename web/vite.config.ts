import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backendOrigin = process.env.CHAT_API_ORIGIN ?? "http://127.0.0.1:9876";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: backendOrigin,
        changeOrigin: true,
        ws: true,
      },
      "/health": {
        target: backendOrigin,
        changeOrigin: true,
      },
    },
  },
});
