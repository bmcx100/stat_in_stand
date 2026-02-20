# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev` (Next.js on port 3000)
- **Build:** `npm run build`
- **Start production:** `npm start`
- **Lint:** `npm run lint` (ESLint with Next.js TypeScript + core web vitals rules)

No test framework is configured.

## Architecture

A mobile-first hockey team tracker for coaches/parents to manage game schedules, results, standings, and playoff tournaments across multiple youth hockey teams. Uses Supabase as the backend with admin authentication.

- **Framework:** Next.js 16.1.6 with React 19, TypeScript 5
- **Styling:** Tailwind CSS v4 via `@tailwindcss/postcss` plugin
- **Component library:** shadcn/ui (New York style, Lucide icons)
- **Theming:** CSS variables in `app/globals.css` using OKLCH color space, light/dark mode
- **Path alias:** `@/*` maps to project root
- **Backend:** Supabase (PostgreSQL, Auth, Row Level Security, Storage)

### Environment Variables

Required in `.env.local` (not committed):
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-side only, for admin invites)

### Data Layer

Data is stored in Supabase PostgreSQL with Row Level Security. Public read access for all tables, authenticated write access scoped by `team_admins` membership. Each hook uses `useState` + `useEffect` for data fetching and provides mutation functions.

| Hook | Supabase Table | Purpose |
|------|---------------|---------|
| `useSupabaseTeams()` | `teams` | Team registry with slug, org, banner |
| `useSupabaseGames()` | `games` | Game schedules and results per team |
| `useSupabaseStandings()` | `standings` | OWHA standings data per team |
| `useSupabaseOpponents()` | `opponents` | Opponent team registry per team |
| `useSupabasePlaydowns()` | `playdowns` | Playdown config + games per team |
| `useSupabaseTournaments()` | `tournaments` | Tournament config + games per team |
| `useFavorites()` | localStorage | User's favorited teams (client-side) |

### Supabase Client Utilities

- `lib/supabase/client.ts` — Browser client using `createBrowserClient()` from `@supabase/ssr`
- `lib/supabase/server.ts` — Server client using `createServerClient()` with Next.js cookie handling

### Database Schema

Tables: `teams`, `team_admins`, `opponents`, `games`, `standings`, `playdowns`, `tournaments`

Migrations in `supabase/migrations/`:
- `001_schema.sql` — Table definitions
- `002_rls.sql` — Row Level Security policies

### Auth & Middleware

- `middleware.ts` — Refreshes Supabase auth session, protects `/admin/*` routes (redirects unauthenticated users to `/admin` login)
- Roles: `super_admin` (manages all teams + admins), `team_admin` (manages assigned teams)

### Key Domain Types (`lib/types.ts`)

- **Game:** Core entity with date, opponent, scores, result (W/L/T), gameType (regular/playoffs/playdowns/tournament/exhibition/provincials), source (owha/mhr/teamsnap/manual)
- **GameType/ImportSource:** Union string types controlling filtering and import behavior
- **PlaydownConfig:** Tournament setup (total teams, qualifying spots, games per matchup)

### Parsers (`lib/parsers.ts`)

Robust multi-source import system handling tab-separated data from OWHA, MHR, and TeamSnap. Key functions:
- `normalizeDate()` — converts any date format to ISO YYYY-MM-DD
- `parseOwhaGames()`, `parseMhrGames()`, `parseTeamsnapGames()` — source-specific parsers
- `findDuplicates()` — detects duplicate games with score mismatch detection
- `matchOpponent()` — fuzzy matches opponent names against the registry

### Season Logic (`lib/season.ts`)

Hockey seasons span Aug-Jul. `inferYear()` handles mid-season date imports where month abbreviations lack year context.

### Playdowns (`lib/playdowns.ts`)

- `computePlaydownStandings()` — standings with tiebreakers (wins, h2h, goal diff, GA)
- `isPlaydownActive()` / `isPlaydownExpired()` — visibility windowing (1 month before to 1 week after)

### Route Structure

```
app/
  page.tsx              — Landing page: list published teams
  team/[slug]/
    layout.tsx          — Public team layout with banner + bottom nav (Home/Schedule/Standings)
    page.tsx            — Dashboard: history cards, scrollable schedule, events
    results/            — All games: filterable list with opponent selection, Last N summary
    standings/          — Standings table with Regular Season / Playdowns mode dropdown
    schedule/           — Upcoming games
    playdowns/          — Playdown bracket + standings
    events/             — Archived events (expired playdowns/tournaments)
    tournaments/[id]/   — Tournament view with pools, standings, graphs
  admin/
    page.tsx            — Login page
    layout.tsx          — Admin layout
    dashboard/          — Admin home: list managed teams
    teams/              — Super admin: create/edit/delete teams, manage admins
    team/[slug]/
      layout.tsx        — Team admin layout with tab nav
      page.tsx          — Team overview (record, counts)
      games/            — Game management: import + CRUD
      standings/        — Standings import + display
      opponents/        — Opponent management: import + CRUD
      events/           — Playdown + tournament management
  api/
    invite-admin/       — Server-side admin invitation endpoint
```

### Team Context

`lib/team-context.tsx` provides `TeamProvider` and `useTeamContext()` for passing team data from layout to child pages without re-fetching. Used in both public and admin team layouts.

### Scroll Pattern

Several pages use a shared pattern: JS `useEffect` modifies the parent element to `overflow: hidden; display: flex; flex-direction: column`, then uses `absolute inset-0` scroll areas with `ResizeObserver` for fade indicators.

## Coding Preferences

- Do NOT use semicolons
- Do NOT apply multiple Tailwind classes directly in templates. Use `@apply` in `globals.css` for compound styles. One class inline is acceptable.
- Use minimal project dependencies
- Use `git switch -c` for new branches, not `git checkout`
- When planning from an existing spec document: PLAN then STOP. Do not implement without explicit user request.
