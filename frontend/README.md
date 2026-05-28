# SADIE Frontend

Vite + React + TypeScript SPA mounted at `/app/*`.

## Dev

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

The dev server proxies `/api`, `/accounts`, and `/media` to `http://localhost:8000`,
so the SPA uses the same session cookies and CSRF as the Django app.

Make sure the Django stack is running in another terminal:

```bash
docker compose up -d
```

## Build

```bash
npm run build        # outputs to frontend/dist
```

In production, Django serves `frontend/dist/index.html` for `/app/*` routes
and the built assets are exposed under `/static/spa/`.

## Layout

- `src/lib/api.ts` — fetch wrapper with cookie + CSRF handling
- `src/lib/auth.ts` — `useMe()` / `useConfig()` queries
- `src/lib/filters.ts` — global Zustand filter store (mirrors dashboard query schema)
- `src/components/Layout.tsx` — top nav, theme toggle, ⌘K trigger
- `src/components/CommandMenu.tsx` — global command palette
- `src/pages/*` — Home, Search, Map, Calendar, Organisations, Login

## Configuration

Runtime config (e.g. MapTiler key) is fetched from `/api/config/` rather than
bundled, so secrets stay on the server.
