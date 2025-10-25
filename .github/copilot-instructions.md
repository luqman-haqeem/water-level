## Repo-specific instructions for AI coding agents

Be productive quickly by following these concise, project-specific conventions and pointers.

- Big picture: Next.js frontend (TypeScript) + Convex backend. Frontend lives under `pages/` and `components/`. Convex server code, schema, cron jobs and sync jobs live in `convex/` and generated types are in `convex/_generated/`.

- Common developer commands (see `package.json` / `CLAUDE.md`):
  - `npm run dev` — start Next.js dev server
  - `npm run build` / `npm start` — production build & run
  - `npm run lint` — run ESLint
  - `npm run convex:dev` — run Convex dev environment (watches schema/functions)
  - `npm run convex:deploy` — deploy Convex functions

- Key integration points to update when changing behavior:
  - Convex schema or functions: edit `convex/schema.ts`, `convex/*.ts` and `convex/sync/*.ts`; run `npx convex dev` locally to test.
  - Generated types: `convex/_generated/` — regenerate when schema changes.
  - Scrapers & data feeders: `scripts/scrapeWaterLevel.js`, `services/*Updater.js` — these push data ingests used by Convex cron jobs.
  - Authentication: `convex/auth.ts` and `pages/_app.tsx` (Convex auth provider wraps the app).

- UI / styling patterns to follow exactly:
  - Use the `cn()` helper from `lib/utils.ts` for conditional classnames.
  - Components are mobile-first and expect touch-friendly sizes (≥44px target). Look at `components/BottomNavigation.tsx`, `components/WaterLevelGauge.tsx` for patterns.
  - Use `components/ui/*` (shadcn) for base primitives and follow existing composition.

- Real-time & state patterns:
  - Convex real-time queries (React hooks like `useQuery`) are used for live updates; prefer Convex queries over local polling for currentLevels.
  - Favorites are stored in Convex tables (`favorites.ts` in `convex/`) and surfaced via the frontend hooks.

- When adding new pages or API proxies:
  - Pages go under `pages/` using Next.js routing (`pages/stations/[id].tsx`, `pages/cameras/index.tsx`).
  - Image proxy route is `pages/api/proxy-image/[id].js` — use this when adding or changing camera image handling.

- Tests, linting, and build checks:
  - Run `npm run lint` and TypeScript compile (`npm run build`) before submitting PRs.
  - ESLint and strict TypeScript are enabled; new code should include types and prefer the generated Convex types.

- Small concrete examples:
  - To add a Convex cron function that ingests scraper output, add the function to `convex/crons.ts` (or `convex/*.ts`) and test locally with `npx convex run <function>`.
  - To add a UI component using existing conventions, mimic `components/StationCard.tsx` and `components/CameraCard.tsx` for layout, and use `cn()` for conditional classes.

- Files worth reading before making changes:
  - `convex/schema.ts`, `convex/waterLevelHistory.ts`, `convex/waterLevelData.ts`, `convex/sync/*`
  - `scripts/scrapeWaterLevel.js`, `services/waterLevelUpdater.js`
  - `components/StationCard.tsx`, `components/WaterLevelGauge.tsx`, `components/BottomNavigation.tsx`

- Pitfalls and conventions discovered in the codebase:
  - This project relies on Convex for server-side types and realtime; modifying the schema often requires updating imports and generated types.
  - Many UI behaviors (haptics, pull-to-refresh) are implemented via hooks in `hooks/`; prefer reusing those hooks over inventing new patterns.
  - OneSignal and PWA behavior are configured; changing service worker or manifest can affect offline behavior—review `public/` and `next.config.mjs`.

If anything here is unclear or you want the file expanded with examples (PR checklist, more command snippets), tell me which sections to expand and I'll iterate.
