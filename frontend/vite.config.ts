import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The app is served from the site root ("/") in both environments:
//   - dev:  the Vite dev server at http://localhost:5173/
//   - prod: a dedicated nginx container serves the build at "/"
// (the Django backend no longer hosts the SPA).
export default defineConfig(() => ({
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
  // Production build is served by the nginx container from the site root.
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Source maps are generated on demand in dev; keeping them on during
    // the Docker/CI production build inflates peak memory by ~5-6 GB and
    // causes the build to be killed by the kernel OOM on GHA runners.
    sourcemap: false,
  },
  base: "/",
}));
