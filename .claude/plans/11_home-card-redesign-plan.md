# Implementation Plan: Home Card Redesign

Source spec: `.claude/specs/11_home-card-redesign.md`
Branch: `claude/feature/home-card-redesign`

---

## Overview

The home screen team cards and add-teams browse list currently show only a team name/banner with a link. This plan adds two layers of live context:

1. **Provincial ranking badge** (`#N`) on every team card and browse-list row, with a hover/tap tooltip linking to the MHR rankings page.
2. **Active event rows** below the card banner — one row per game type with activity in a ±7-day window. Each row is collapsible to show last result, next game details, opponent's standing, and head-to-head record. Teams with no window activity show a single fallback row based on the global app mode.

Because favorites live in `localStorage`, all data fetching must remain client-side. A single bulk query per table avoids N+1 requests.

---

## Prerequisites / Dependencies

- `app_settings` table and `/api/app-settings` GET endpoint must exist (✅ done in previous commit)
- `mhr_config` and `mhr_rankings` tables must exist (✅ migration 005)
- `standings` table with `standings_type` column must exist (✅ migration 004)
- `tournaments` table with `config` and `games` JSONB must exist (✅ migration 001)
- Games table has `date`, `team_id`, `game_type`, `opponent_name`, `result`, `team_score`, `opponent_score`, `played`, `time` columns (✅ migration 001)

---

## Data Model Notes

- **Games window:** query `games` where `date` is within ±7 days and `game_type IN ('regular','playoffs','playdowns','tournament')` for all favorited team IDs.
- **Tournament name lookup:** the `games` table has no `tournament_id` column. Tournament name comes from the `tournaments` table — fetch all tournament rows for the team, check if any tournament's `games` JSONB contains entries with dates within the window. Match to get the tournament name from `config.name` (or `tournament_id` as fallback label).
- **Standings position:** the `standings` table `rows` JSONB is an ordered array. Position = index of our team's row + 1. Total = array length.
- **MHR ranking:** `mhr_rankings.rows` is an array of `{ team_nbr, ranking, week }`. Cross-reference `mhr_config.team_nbr` to find the entry. Use the row with the most recent `synced_at`.
- **MHR rankings URL:** `https://myhockeyrankings.com/rank?y={year}&a={div_age}&v={div_nbr}` — constructed from `mhr_config.div_age` and `mhr_config.div_nbr`.

---

## Implementation Phases

---

### Phase 1 — Pure utility functions (`lib/home-cards.ts`)

Create a new file with all the logic that can be unit-tested in isolation. No React, no Supabase calls.

**Functions to implement:**

1. `detectActiveEvents(games: GameRow[], teamId: string, windowDays = 7): Set<string>`
   - Filters games for the given teamId where `date` is within `±windowDays` of today.
   - Returns a Set of active `game_type` strings (e.g. `{'regular', 'tournament'}`).

2. `lookupRanking(teamNbr: number | null, rankRows: Array<{team_nbr: number; ranking: number}>): number | null`
   - Finds the entry in `rankRows` where `team_nbr === teamNbr`.
   - Returns the `ranking` value or `null` if not found.

3. `buildRecordFromGames(games: GameRow[], gameType: string): { w: number; l: number; t: number; gp: number }`
   - Filters games by `game_type` and `played === true`, counts results.

4. `getH2H(games: GameRow[], gameType: string, opponentName: string): { w: number; l: number; t: number }`
   - Filters played games of the given type where `opponent_name` fuzzy-matches `opponentName`.
   - Uses the same `norm()` approach already in the codebase.

5. `getOpponentStanding(opponentName: string, rows: StandingsRow[]): { position: number; total: number; record: string } | null`
   - Fuzzy-matches `opponentName` against `rows[].teamName`.
   - Returns position (1-indexed), total teams, and formatted `W-L-T` record string.
   - Returns `null` if no match found.

6. `getStandingsPosition(teamOrg: string, teamName: string, rows: StandingsRow[]): { position: number; total: number } | null`
   - Finds our own team's row using the same full org+name matching logic already in the codebase.

7. `getLastGame(games: GameRow[], gameType: string): GameRow | null`
   - Most recent played game of the given type.

8. `getNextGame(games: GameRow[], gameType: string): GameRow | null`
   - Nearest future (unplayed) game of the given type by date.

9. `formatEventDate(date: string, time: string): string`
   - Formats a game date + time string, e.g. `"Sat Mar 1 · 7:00pm"`.

---

### Phase 2 — Data fetching hook (`hooks/use-home-card-data.ts`)

A new hook that takes `teamIds: string[]` and fetches all required data in parallel. Returns `null` while loading, then a structured result.

**Fetches in a single `Promise.all`:**
- `games` where `team_id IN (teamIds)` and `date >= today-7` and `date <= today+7` and `game_type IN ('regular','playoffs','playdowns','tournament')`
- `standings` where `team_id IN (teamIds)` — all standings types
- `mhr_config` where `team_id IN (teamIds)`
- `mhr_rankings` where `team_id IN (teamIds)` — take only the most recent row per team (order by `synced_at desc`, limit by team in post-processing)
- `tournaments` where `team_id IN (teamIds)` — for tournament name resolution
- `app_settings` via fetch to `/api/app-settings` (for global mode fallback)

**Returns a `Map<teamId, HomeCardData>` where `HomeCardData` is:**
```
{
  ranking: number | null
  rankingUrl: string | null      // MHR link for tooltip
  rankingLabel: string | null    // e.g. "4th in Ontario — U15 AA"
  activeEvents: ActiveEvent[]    // ordered: tournament, playoffs, playdowns, regular
  fallbackMode: AppMode          // used when activeEvents is empty
}
```

**`ActiveEvent` shape:**
```
{
  gameType: string
  label: string          // "Regular", "Playoffs", "Playdowns", or tournament name
  collapsedSummary: string
  lastGame: GameRow | null
  nextGame: GameRow | null
  opponentStanding: { position, total, record } | null
  h2h: { w, l, t }
  detailPath: string     // e.g. "/team/[slug]/standings"
}
```

**Tournament matching logic in this hook:**
- For each team, check if any `tournaments.games` JSONB entries have dates in the ±7 day window.
- If yes, use `tournaments.config.name` (or `tournament_id` as label fallback) as the `label` for that event row.
- If no tournament record matches but `game_type === 'tournament'` games exist in the games table window, use the label `"Tournament"`.

---

### Phase 3 — UI components

#### `components/ranking-badge.tsx`

A small inline component rendering `#N`.
- Props: `ranking: number | null`, `tooltipLabel: string`, `rankingUrl: string`
- When `ranking` is null, renders nothing.
- On desktop: CSS hover shows tooltip with label + link.
- On mobile: tap toggles the tooltip open/closed (use a simple `useState` toggle, not a library).
- Tooltip contains: label text + `"View full rankings ↗"` link.

#### `components/team-event-row.tsx`

Renders one collapsed or expanded event row.
- Props: `event: ActiveEvent`, `teamSlug: string`, `expanded: boolean`, `onToggle: () => void`
- Collapsed state: chevron icon + label + `collapsedSummary` on one line.
- Expanded state: shows last game line, next game line (with opponent standing below it), H2H line. Each line is omitted if data is null. Arrow-link `↗` to `detailPath`.
- Animation: simple CSS max-height transition for expand/collapse.

---

### Phase 4 — Update home page (`app/page.tsx`)

**Changes:**
1. After teams load and favorites hydrate (both `!loading` and `hydrated`), derive `favoriteTeamIds` from the cross-reference of favorite slugs → team IDs.
2. Call `useHomeCardData(favoriteTeamIds)` — pass empty array `[]` until both are ready, which causes the hook to skip fetching.
3. In each team card, render:
   - `<RankingBadge>` positioned in the card header area (top-right, alongside the heart button).
   - `<div className="team-card-events">` below the banner area containing one `<TeamEventRow>` per active event, or one fallback row if no active events.
4. Track `expandedRow: { teamId: string; eventType: string } | null` in component state — only one row open at a time across all cards.
5. The team-card-link area shrinks to just the banner/name portion — event rows sit outside the main link.

---

### Phase 5 — Update add-teams page (`app/teams/page.tsx`)

**Changes:**
1. After teams load and hydrate, fetch `mhr_config` and `mhr_rankings` for ALL published team IDs (not just favorites) in one query each.
2. Compute ranking per team using `lookupRanking()`.
3. Add `<RankingBadge>` to each team row.
4. No event rows on this page — ranking badge only.

---

### Phase 6 — CSS (`app/globals.css`)

Add the following new class groups:

**Ranking badge:**
- `.ranking-badge` — inline pill, small font, muted border, sits in top-right of card
- `.ranking-badge-tooltip` — absolute positioned, appears on hover / when `.is-open`
- `.ranking-badge-tooltip a` — link styling within tooltip

**Event rows container:**
- `.team-card-events` — sits below the banner, no border-radius on top, separates from banner with a top border

**Individual event row:**
- `.team-event-row` — full-width, flex row, cursor pointer, subtle hover bg
- `.team-event-row-header` — flex between label+summary and chevron
- `.team-event-label` — bold, small
- `.team-event-summary` — muted, small, truncated
- `.team-event-chevron` — rotates 180° when expanded
- `.team-event-detail` — max-height: 0 collapsed, transitions open; overflow hidden
- `.team-event-detail-line` — each detail line (last, next, series)
- `.team-event-detail-sub` — sub-line below next game (opponent standing)
- `.team-event-link` — the ↗ arrow link in expanded header

---

### Phase 7 — Tests (`tests/home-cards.test.ts`)

Write unit tests for the three utility functions called out in the spec:

1. **Active event detection** — given games array with specific dates relative to "today", assert correct `Set` of active types is returned. Test boundary cases (exactly 7 days out, 8 days out).
2. **Ranking lookup** — given rows array and a `team_nbr`, assert correct rank returned; assert `null` when not found; assert `null` when `teamNbr` itself is null.
3. **H2H record** — given games array with opponent names and results, assert correct W-L-T counts; assert fuzzy name matching works; assert unplayed games are excluded.

---

## Files Created

| File | Purpose |
|---|---|
| `lib/home-cards.ts` | Pure utility functions — event detection, ranking lookup, H2H, standings position |
| `hooks/use-home-card-data.ts` | Data fetching hook — bulk parallel queries, structured result per team |
| `components/ranking-badge.tsx` | `#N` badge with hover/tap tooltip |
| `components/team-event-row.tsx` | Collapsible event row component |
| `tests/home-cards.test.ts` | Unit tests for utility functions |

## Files Modified

| File | Changes |
|---|---|
| `app/page.tsx` | Wire in hook, render ranking badges + event rows per card |
| `app/teams/page.tsx` | Add ranking badge fetch + render |
| `app/globals.css` | New CSS for badge, event rows, tooltip, transitions |

---

## Risks & Considerations

1. **Tournament name matching is the most fragile part.** The `games` table has no `tournament_id` foreign key. Matching tournament records by date overlap in JSONB is imperfect. Start with a simple date-overlap check and use "Tournament" as generic fallback — don't block the whole feature on this.

2. **Opponent name fuzzy matching for H2H and standings can miss.** OWHA sometimes formats the same opponent differently across games. Use the existing `norm()` approach but accept that some misses will silently omit the data line — this is the correct graceful behaviour per spec.

3. **MHR rankings week interpretation.** The `week` field is an integer from MHR. "Most recent" is determined by `synced_at`, not `week` number, since week numbers are MHR-internal and not necessarily sequential with wall clock time.

4. **Performance on large favorites lists.** If a user has 10+ favorites, the games window query could return a large result set. The query is still a single DB call so this is fine, but post-processing (grouping, sorting) happens client-side — keep utility functions efficient.

5. **Playdowns collapsed summary requires playdowns config.** "Alive · 3-2 · 4th of 6" needs the `computePlaydownStandings()` function from `lib/playdowns.ts`. The hook will need to also fetch the `playdowns` table row for teams with active playdown games. Add this to the `Promise.all` in the hook.

6. **`app/page.tsx` is currently fully client-side.** Do not convert to a server component — favorites are localStorage-only and must be read client-side. Keep the existing hydration guard pattern.
