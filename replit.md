# Attendenz

Offline-first attendance management app for MBBS students. Multi-account, per-user data isolation, with optional cloud sync via Cloudflare Workers.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4
- **Backend**: Express (Cloudflare Workers optional) — `artifacts/api-server`
- **Storage**: LocalStorage / IndexedDB (offline-first); Cloudflare D1 for cloud sync
- **Monorepo**: pnpm workspaces (`pnpm-workspace.yaml`)

## Project Structure

```
artifacts/
  attendance-tracker/   # Main React web app (preview path: /)
  api-server/           # Express API server (preview path: /api)
  mockup-sandbox/       # Design/canvas preview server (preview path: /__mockup)
lib/
  api-client-react/     # React hooks for API
  api-spec/             # Shared API types
  api-zod/              # Zod schemas
  db/                   # Database layer (Drizzle ORM)
```

## How to Run

Dependencies are managed with pnpm:

```bash
pnpm install
```

Workflows start automatically:
- **Attendance Tracker** (`artifacts/attendance-tracker: web`) — main app
- **API Server** (`artifacts/api-server: API Server`) — backend
- **Canvas** (`artifacts/mockup-sandbox: Component Preview Server`) — design sandbox

## Important Setup Notes

- `pnpm-workspace.yaml` is required (added during Replit setup) — the root `package.json` uses npm workspace syntax which pnpm doesn't support
- `.npmrc` has `link-workspace-packages=true` to resolve local `@workspace/*` packages
- `pnpm.onlyBuiltDependencies` in `package.json` is required for esbuild native binaries to build
- The attendance-tracker dev script must NOT hardcode `--port` — vite config reads `PORT` env var

## User Preferences

- Keep the existing project structure and stack
