import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// In dev (`vite dev`), base is "/" so the app loads at http://localhost:5173/.
// In production build (`vite build`), base is "/static/spa/" so Django can serve
// the assets from its staticfiles directory.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": process.env.BACKEND_URL ?? "http://localhost:8000",
      "/accounts": process.env.BACKEND_URL ?? "http://localhost:8000",
      "/media": process.env.BACKEND_URL ?? "http://localhost:8000",
    },
  },
  // Production build is consumed by Django: index.html lives at frontend/dist
  // and is served by a TemplateView at /app/*; static assets are mounted via
  // STATICFILES_DIRS on /static/spa/.
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Source maps are generated on demand in dev; keeping them on during
    // the Docker/CI production build inflates peak memory by ~5-6 GB and
    // causes the build to be killed by the kernel OOM on GHA runners.
    sourcemap: false,
  },
  base: command === "serve" ? "/" : "/static/spa/",
}));
