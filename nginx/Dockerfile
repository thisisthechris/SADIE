# Front-door image: builds the Vite SPA and serves it via nginx, while
# reverse-proxying API/admin/feeds/media to the Django (gunicorn) container.
#
# Build context is the repository root so the frontend source is available:
#   docker build -f nginx/Dockerfile -t sadie-nginx .

# ── Stage 1: build the SPA ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /frontend
# Raise the Node.js heap limit so vite + source-map generation doesn't OOM
# on memory-constrained CI runners (the default ~1.5 GB is too small).
ENV NODE_OPTIONS=--max-old-space-size=4096
# Put local .bin on PATH so tsc / vite can be called directly in RUN steps.
ENV PATH=/frontend/node_modules/.bin:$PATH
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
# Split into two layers: if tsc fails you see TypeScript errors; if vite fails
# you see vite errors.
RUN tsc -b
RUN vite build

# ── Stage 2: serve with nginx ────────────────────────────────────────────────
FROM nginx:1.27-alpine
# Replace the default server config with ours (SPA + backend proxying).
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
# Ship the built SPA. nginx serves these static files directly at the root.
COPY --from=frontend /frontend/dist /usr/share/nginx/html

EXPOSE 80
