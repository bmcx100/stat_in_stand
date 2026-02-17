# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev` (Next.js on port 3000)
- **Build:** `npm run build`
- **Start production:** `npm start`
- **Lint:** `npm run lint` (ESLint with Next.js TypeScript + core web vitals rules)

No test framework is configured.

## Architecture

A mobile-first hockey team tracker for coaches/parents to manage game schedules, results, standings, and playoff tournaments across multiple youth hockey teams.

- **Framework:** Next.js 16.1.6 with React 19, TypeScript 5
- **Styling:** Tailwind CSS v4 via `@tailwindcss/postcss` plugin
- **Component library:** shadcn/ui (New York style, Lucide icons)
- **Theming:** CSS variables in `app/globals.css` using OKLCH color space, light/dark mode
- **Path alias:** `@/*` maps to project root

### Data Layer

All state is client-side using `useSyncExternalStore` + localStorage. No backend or database. Each hook follows the same pattern: global mutable store, listener array, cache to avoid redundant JSON parsing, `subscribe()`/`getSnapshot()` for React integration, and `emitChange()` to notify listeners.

| Hook | Storage Key | Purpose |
|------|------------|---------|
| `useGames()` | `team-games` | Game schedules and results per team |
| `useStandings()` | `team-standings` | OWHA standings data per team |
| `useOpponents()` | `opponents` | Opponent team registry (shared across teams) |
| `usePlaydowns()` | `team-playdowns` | Playdown config + games per team |
| `useFavorites()` | `favorite-teams` | User's selected teams |

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

### Page Structure

```
app/dashboard/[teamId]/
  layout.tsx        — team banner + fixed bottom nav (Home/Schedule/Standings/Admin)
  page.tsx          — dashboard: History cards, scrollable schedule, Events section
  results/          — All Games: filterable list with opponent selection, Last N summary
  regular-season/   — standings table + filtered game list
  schedule/         — upcoming games
  playdowns/        — tournament bracket + standings
  events/           — archived events (expired playdowns)
  import/           — admin: multi-tab data import (OWHA/MHR/TeamSnap + standings + opponents)
  add-game/         — manual game entry
```

### Scroll Pattern

Several pages use a shared pattern: JS `useEffect` modifies the parent `team-layout-content` to `overflow: hidden; display: flex; flex-direction: column`, then uses `absolute inset-0` scroll areas with `ResizeObserver` for fade indicators.

### Teams (`lib/teams.ts`)

Hardcoded team registry (Nepean Wildcats, Ottawa Ice) with banner images and metadata. Teams are identified by slug IDs.

## Coding Preferences

- Do NOT use semicolons
- Do NOT apply multiple Tailwind classes directly in templates. Use `@apply` in `globals.css` for compound styles. One class inline is acceptable.
- Use minimal project dependencies
- Use `git switch -c` for new branches, not `git checkout`
- When planning from an existing spec document: PLAN then STOP. Do not implement without explicit user request.
