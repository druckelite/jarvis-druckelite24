import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "web",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:10000",
        changeOrigin: true,
      },
    },
  },
});
