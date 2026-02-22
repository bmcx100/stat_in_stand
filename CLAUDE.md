# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev` (Next.js on port 3000)
- **Build:** `npm run build`
- **Lint:** `npm run lint` (ESLint with Next.js TypeScript + core web vitals rules)

No test framework is configured.

## Architecture

A mobile-first hockey team tracker for coaches/parents to manage game schedules, results, standings, and playoff tournaments across multiple youth hockey teams. Uses Supabase as the backend with admin authentication.

- **Framework:** Next.js with React 19, TypeScript 5
- **Styling:** Tailwind CSS v4 via `@tailwindcss/postcss` plugin
- **Component library:** shadcn/ui (New York style, Lucide icons)
- **Theming:** CSS variables in `app/globals.css` using OKLCH color space, light/dark mode
- **Path alias:** `@/*` maps to project root
- **Backend:** Supabase (PostgreSQL, Auth, Row Level Security, Storage)

### Environment Variables

Required in `.env.local` (not committed):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, for admin operations that bypass RLS

### Data Layer

Public read access on all tables; authenticated write access scoped by `team_admins` membership via RLS. Each hook uses `useState` + `useEffect` for fetching with mutation functions that update both DB and local state.

| Hook | Supabase Table | Purpose |
|------|---------------|---------|
| `useSupabaseTeams()` | `teams` | Team registry with slug, org, banner |
| `useSupabaseGames()` | `games` | Game schedules and results per team |
| `useSupabaseStandings()` | `standings` | OWHA standings data per team (one row per team, `rows` JSONB blob) |
| `useSupabaseOpponents()` | `opponents` | Opponent team registry per team |
| `useSupabasePlaydowns()` | `playdowns` | Playdown config + games per team |
| `useSupabaseTournaments()` | `tournaments` | Tournament config + games per team |
| `useFavorites()` | localStorage | User's favorited teams (client-side only) |

Centralized query functions live in `lib/supabase/queries.ts`. Hooks import from there rather than calling Supabase directly inline.

- `lib/supabase/client.ts` — Browser client (`createBrowserClient()` from `@supabase/ssr`)
- `lib/supabase/server.ts` — Server client with Next.js cookie handling

### Database Schema

Tables: `teams`, `team_admins`, `opponents`, `games`, `standings`, `playdowns`, `tournaments`

Migrations in `supabase/migrations/`: `001_schema.sql` (tables), `002_rls.sql` (RLS policies), `003_owha_sync.sql` (OWHA columns added to tables).

Key non-obvious schema details:
- `standings` table has **one row per team** with a `rows` JSONB blob — no per-type separation. Only regular season standings are persisted; playoff standings are returned from the API but not saved.
- `games.game_type` stores the type (`regular`, `playoffs`, `playdowns`, `tournament`, `exhibition`, `provincials`). Duplicate detection in OWHA sync includes `.eq("game_type", gameType)` to prevent cross-type collisions.
- `playdowns` and `tournaments` tables store `config` + `games` as JSONB blobs alongside relational metadata.

### Auth & Middleware

- `middleware.ts` — Refreshes Supabase auth session, protects `/admin/*` routes
- Roles: `super_admin` (all teams + admins), `team_admin` (assigned teams only)
- Admin API routes use a service role client (bypasses RLS) after verifying the caller via `team_admins` table

### Key Domain Types (`lib/types.ts`)

- **Game:** `gameType` union: `"unlabeled" | "regular" | "tournament" | "exhibition" | "playoffs" | "playdowns" | "provincials"`; `source` union: `"owha" | "mhr" | "teamsnap" | "manual"`
- **PlaydownConfig:** tournament setup (totalTeams, qualifyingSpots, gamesPerMatchup, teams)
- **StandingsRow:** per-team row stored in the `rows` JSONB blob (gp, w, l, t, otl, sol, pts, gf, ga)

### OWHA Sync System (`app/api/owha-sync/route.ts`)

The most complex part of the codebase. A single POST endpoint handles multiple sync types via the `type` field in the request body:

| `type` value | What it does |
|---|---|
| `"regular"` | Syncs regular season games using `GTID_REGULAR` (5069) |
| `"playoffs"` | Syncs playoff games using same division URL but `GTID_PLAYOFFS` (5387) |
| `"standings"` | Syncs regular season standings, persisted to DB |
| `"playoffs-standings"` | Fetches playoff standings with `GTID_PLAYOFFS`, returned but **not persisted** |
| `"event"` + `eventType: "playdown"` | Syncs playdown games from configured URL |
| `"event"` + `eventType: "tournament"` | Syncs tournament games |

**OWHA uses two separate API systems:**
- Regular/playoffs: `AID=2788, SID=12488` (SID changes each season — check DevTools)
- Playdowns: `AID=3617, SID=13359` (also changes annually)

**Playdown loop filtering:** The playdowns standings API returns all teams province-wide. The sync fetches standings first, finds the team's `SDID` (subdivision/loop ID), then uses the loop's team names to pre-filter games to only those between teams in the same loop — because the games API also returns province-wide data and `HomeTID`/`AwayTID` in games don't match `TID` in standings (different ID systems cross-API).

**URL conversion helpers:**
- `toApiBaseUrl(divisionUrl)` — converts OWHA division page URL to games API URL
- `toStandingsUrl(divisionUrl)` — converts to standings API URL (handles CATID=0 playdowns vs CATID!=0 regular)

The success response includes a `debug` object (populated for playdowns) with standings fetch details, loop SDID, loop team names, and game counts at each filter stage.

### Admin Overview (`app/admin/team/[slug]/page.tsx`)

Three `SeasonCard` components (Regular Season, Playoffs, Playdowns), each containing:
- `SyncPanel` (left half): Sync Games + Sync Standings buttons with last-synced timestamps
- `MismatchStat` (right half): shows W/L/T record and GP with green animated checkmark when matching standings, or red mismatch indicator with tooltip when not

Mismatch detection compares game-derived stats (filtered to `gameType === "regular"`) against the stored standings rows via fuzzy team name matching. Only the Regular Season card does this comparison — Playoffs and Playdowns cards don't have standings to compare against.

### Admin Standings Page (`app/admin/team/[slug]/standings/page.tsx`)

Type filter dropdown (Regular Season / Playoffs / Playdowns / tournaments / Provincials). Only `selectedType === "regular"` shows data and Edit/Clear controls — all other types show "Standings are not available for this type" because only regular season standings are persisted to DB.

### Super Admin Configure Panel (`app/admin/teams/page.tsx`)

The "Configure" button on each team card expands a panel with:
1. OWHA Regular Season URL → saved to `teams.owha_url_regular`
2. OWHA Playdowns URL → saved to `playdowns.owha_url` (creates the playdowns row with empty default config if none exists)

Both saved simultaneously with one Save button via parallel `fetch` calls to `/api/owha-config`.

### Route Structure

```
app/
  page.tsx                     — Landing: list published teams
  team/[slug]/
    layout.tsx                 — Public layout: sticky banner + bottom nav
    page.tsx                   — Dashboard: history cards, schedule, events
    results/                   — All games filterable list + Last N summary
    standings/                 — Standings table with mode dropdown
    schedule/                  — Upcoming games
    playdowns/                 — Playdown bracket + standings
    events/                    — Archived expired events
    tournaments/[id]/          — Tournament pools, standings, graphs
  admin/
    page.tsx                   — Login
    dashboard/                 — Admin home
    teams/                     — Super admin: team + admin management
    team/[slug]/
      layout.tsx               — Tab nav sidebar
      page.tsx                 — Overview: season cards with sync + mismatch detection
      games/                   — Game management (Add Game card, type filter, Clear modal)
      standings/               — Standings display + inline edit (type-scoped)
      opponents/               — Opponent management
      events/                  — Events list
      events/playdown/         — Playdown config
      events/playoffs/         — Playoffs config
      events/tournament/[id]/  — Tournament config
  api/
    invite-admin/              — POST: super_admin invite by email
    owha-sync/                 — POST: OWHA games + standings sync (all types)
    owha-config/               — PATCH: save OWHA URLs for regular/playdown/tournament
```

### Parsers (`lib/parsers.ts`)

Multi-source import: `parseOwhaGames()`, `parseMhrGames()`, `parseTeamsnapGames()`. `findDuplicates()` detects same game from different sources with score mismatch flagging. `matchOpponent()` fuzzy-matches names against registry.

### Playdowns Logic (`lib/playdowns.ts`)

`computePlaydownStandings()` implements multi-level tiebreakers (wins → h2h → goal diff → GA) with `TiebreakerResolution` tracking. Qualification status: `"locked"` (clinched), `"alive"` (still possible), `"out"` (eliminated). `isPlaydownActive()` / `isPlaydownExpired()` use a visibility window (1 month before to 1 week after).

### Season Logic (`lib/season.ts`)

Hockey seasons span Aug–Jul. `inferYear()` handles mid-season imports where month abbreviations lack year context.

### Team Context

`lib/team-context.tsx` provides `TeamProvider` + `useTeamContext()` — passes team data from layout to child pages without re-fetching.

### Scroll Pattern

Several pages use `useEffect` to set parent to `overflow: hidden; display: flex; flex-direction: column`, then `absolute inset-0` scroll containers with `ResizeObserver` for top/bottom fade indicators.

### CSS / Styling

- Do **not** apply multiple Tailwind classes inline in JSX. Use `@apply` in `globals.css` for compound styles. One class inline is acceptable.
- Admin pages use "Obsidian" sidebar layout (`.ob-*` classes): 224px fixed sidebar + flexible content
- Public pages constrain to `max-w-[430px]` (mobile-first)
- `app/globals.css` is the single source of truth for all component styles (~2200+ lines)

## Coding Preferences

- Do **not** use semicolons
- Use `git switch -c` for new branches, not `git checkout`
- When planning from an existing spec document: PLAN then STOP. Do not implement without explicit user request.
- Use minimal project dependencies
