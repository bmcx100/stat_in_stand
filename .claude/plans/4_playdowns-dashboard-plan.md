# Plan: Playdowns Dashboard

## Context

Playdowns are a round-robin series where a fixed group of teams play each other a set number of times. The top N teams qualify for Provincials. This feature adds a dedicated Playdowns page, a dashboard card that appears when playdowns are near, an Admin section for configuration/game management, and a Past Events page for archived playdowns.

## New Types (`lib/types.ts`)

### PlaydownConfig
```
{
  teamId: string
  totalTeams: number
  qualifyingSpots: number
  gamesPerMatchup: number
  startDate: string          // ISO date, controls dashboard card visibility
  endDate?: string           // ISO date, optional
  teams: PlaydownTeam[]      // participating teams
}
```

### PlaydownTeam
```
{
  id: string                 // opponent ID or special "self" for tracked team
  name: string               // display name
  opponentId?: string        // link to opponent registry
}
```

### PlaydownGame
```
{
  id: string
  teamId: string             // which tracked team this playdown belongs to
  date: string
  time: string
  homeTeam: string           // PlaydownTeam id
  awayTeam: string           // PlaydownTeam id
  homeScore: number | null
  awayScore: number | null
  location: string
  played: boolean
}
```

### PlaydownStandingsRow (computed, not stored)
```
{
  teamId: string
  teamName: string
  gp: number
  w: number
  l: number
  t: number
  pts: number                // 2W + 1T + 0L (fixed)
  gf: number
  ga: number
  diff: number
  qualifies: boolean         // top N
}
```

### PlaydownData (stored per tracked team)
```
{
  config: PlaydownConfig
  games: PlaydownGame[]
}
```

## New Hook: `hooks/use-playdowns.ts`

- Storage key: `"team-playdowns"`
- Same `useSyncExternalStore` + localStorage pattern as `use-games.ts`
- Store shape: `Record<string, PlaydownData>` keyed by teamId
- Methods:
  - `getPlaydown(teamId)` — returns PlaydownData or null
  - `setConfig(teamId, config)` — save/update config
  - `addGame(teamId, game)` — add a playdown game
  - `updateGame(teamId, gameId, updates)` — edit score, date, etc.
  - `removeGame(teamId, gameId)` — delete a game
  - `setGames(teamId, games)` — bulk set (for import)
  - `clearPlaydown(teamId)` — remove all playdown data

## Standings Calculation: `lib/playdowns.ts` (new file)

- `computePlaydownStandings(config, games): PlaydownStandingsRow[]`
- Calculate GP, W, L, T, PTS (2-1-0 fixed), GF, GA, Diff for each team
- Sort by PTS desc, then tiebreakers in order:
  1. Number of wins
  2. Record against tied teams (head-to-head)
  3. Goal differential (GF - GA)
  4. Fewest goals allowed
  5. (Periods won and PIM require data we won't track — skip for now, note in UI)
- Mark top N as `qualifies: true`

## Dashboard Visibility Logic

In `app/dashboard/[teamId]/page.tsx`:
- Import `usePlaydowns`, get playdown data
- Show the Playdowns card when:
  - Config exists AND
  - Current date is within 1 month before `startDate`, OR between `startDate` and `endDate`, OR within 1 week after `endDate`
- Card shows playdown W-L-T record for the tracked team, links to `/dashboard/[teamId]/playdowns`

## Past Events Page: `app/dashboard/[teamId]/past-events/page.tsx`

- Shows cards for events that have expired (more than 1 week past end date)
- Each card links to the corresponding event page (e.g., `/dashboard/[teamId]/playdowns`)
- Uses same `dashboard-record-card` styling
- Dashboard gets a "Past Events" nav link (always visible if there are past events)

## Playdowns Page: `app/dashboard/[teamId]/playdowns/page.tsx`

- Sub-page header with back link to dashboard
- Shows setup summary: "X teams, top Y qualify for Provincials"
- Standings table using existing `.standings-table` CSS classes
  - Qualifying teams highlighted (green background or border)
  - Tracked team row highlighted/bolded
  - Horizontal line or visual separator after Nth qualifying spot
- Game list split into two sections:
  - **Completed**: most recent first, showing both teams, score, date
  - **Upcoming**: soonest first, showing both teams, date, time, location

## Admin Changes: `app/dashboard/[teamId]/import/page.tsx`

### New Admin Tab: "Modes"
- Added to `AdminTab` type: `"import" | "games" | "opponents" | "modes" | "data"`
- Modes tab shows toggleable feature cards (currently just "Playdowns")
- When Playdowns is enabled, shows sub-sections:

#### Setup Sub-section
- Form fields: total teams, qualifying spots, games per matchup, start date, end date
- Team list: pick from opponent registry (searchable) or add manually
- Save button persists config

#### Standings Sub-section
- Displays computed standings table (same as public page)
- "Import Standings" option — paste OWHA-format standings to override/seed the table
- Manual override: admin can edit any row if needed

#### Games Sub-section
- Editable table of all playdown games (reuse `.games-table` CSS pattern)
- Columns: Date, Time, Home Team, Away Team, Home Score, Away Score, Location, Actions
- Add Game button for manual entry
- Score entry inline — type scores, standings auto-recalculate
- Delete game with confirmation (same pattern as existing games table)

## Backup: `lib/backup.ts`

- Add `"team-playdowns"` to `STORAGE_KEYS` array

## Files to Create
1. `hooks/use-playdowns.ts` — localStorage hook
2. `lib/playdowns.ts` — standings computation + tiebreaker logic
3. `app/dashboard/[teamId]/playdowns/page.tsx` — public playdowns page
4. `app/dashboard/[teamId]/past-events/page.tsx` — past events archive

## Files to Modify
1. `lib/types.ts` — add PlaydownConfig, PlaydownTeam, PlaydownGame, PlaydownStandingsRow, PlaydownData
2. `lib/backup.ts` — add `"team-playdowns"` to STORAGE_KEYS
3. `app/dashboard/[teamId]/page.tsx` — add Playdowns card (conditional), Past Events nav link
4. `app/dashboard/[teamId]/import/page.tsx` — add "Modes" admin tab with Playdowns setup/standings/games
5. `app/globals.css` — add qualifying highlight styles, playdown-specific styles if needed

## Verification
- `npm run build` passes
- Configure a playdown in Admin > Modes > Playdowns with teams, dates, qualifying spots
- Dashboard card appears when within 1 month of start date
- Enter game scores in Admin — standings auto-calculate with correct points and tiebreakers
- Playdowns page shows accurate standings with qualifying cutoff indicated
- After end date + 1 week, card moves to Past Events page
- Backup/restore includes playdown data
