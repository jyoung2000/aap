# JobPilot — Frontend

A polished, Apple-like single-page app for the JobPilot self-hosted job-search &
auto-apply platform. Built with **React 18 + Vite + TypeScript (strict) + Tailwind
CSS + React Router v6**, using **Recharts** for charts. No runtime CDN
dependencies — everything (including the QR generator and icons) is bundled, so it
is CSP-safe.

## Prerequisites

- Node.js **v22+**
- The JobPilot FastAPI backend running on **http://localhost:1456** (for `npm run dev`)

## Commands

```bash
npm install       # install pinned dependencies
npm run dev       # Vite dev server on http://localhost:5173 (proxies /api and /ws -> :1456)
npm run build     # type-check (tsc) + production build into ../backend/app/static
npm run preview   # preview the production build locally
npm run typecheck # tsc --noEmit only
```

`npm run build` writes `index.html` to `backend/app/static/` and hashed assets to
`backend/app/static/assets/`. The build uses `emptyOutDir: false`, so the
co-located `static/extension/` bundle folder is **never** wiped.

In production the FastAPI app serves this build from a single origin (port 1456),
so all API calls are relative and rely on the session cookie.

## Architecture

```
src/
  api/          Typed API client (hand-written fetch + CSRF), types, endpoint wrappers
  components/   UI primitives (ui/), layout (shell, sidebar), charts, QR, icons
  context/      Theme + Auth providers
  hooks/        useSocket (WS event bus + reconnect), useApi, useDebouncedCallback, ...
  lib/          cn, formatters, constants, status maps, self-contained QR encoder
  pages/        Route screens (Dashboard, Search, Jobs, Queue, Analytics, Profile, Settings)
```

### Auth & CSRF

The backend sets an httpOnly session cookie plus a readable `jp_csrf` cookie
(double-submit CSRF). The client reads `jp_csrf` and sends it as `X-CSRF-Token`
on every non-GET request, always with `credentials: 'include'`. Any `401`
redirects to `/signin`.

### Live updates

`src/hooks/useSocket.ts` opens `wss?://<host>/ws/app` after auth, pings every ~25s,
reconnects with exponential backoff, and exposes a small event bus so pages
subscribe to `search.progress`, `application.update`, `intervention.new`,
`screencast.frame`, `ext.status`, etc. The Apply Queue uses it for real-time
interventions and the remote CAPTCHA screencast flow (works on a phone).

### Theming

System / light / dark, applied via the `dark` class on `<html>`, persisted to
`localStorage` and synced to `user.theme`. A pre-paint inline script in
`index.html` prevents a flash of the wrong theme.
