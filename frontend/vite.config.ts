import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Frontend dev server proxies API calls to the Django backend so the SPA
// can rely on same-origin cookies / CSRF in development just like prod.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/accounts": "http://localhost:8000",
      "/media": "http://localhost:8000",
    },
  },
  // Production build is consumed by Django: index.html lives at frontend/dist
  // and is served by a TemplateView at /app/*; static assets are mounted via
  // STATICFILES_DIRS on /static/spa/.
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  base: "/static/spa/",
});
