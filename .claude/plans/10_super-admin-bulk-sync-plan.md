# Implementation Plan: Super Admin Bulk Sync & Status Dashboard

## Overview

Two connected features for the super admin:

1. **`/admin/sync`** — A new bulk sync page that runs any sync type across all teams sequentially, showing per-team results live as they complete.
2. **Status strip on `/admin/teams`** — Each team card gets a row of colour-coded indicators (green/yellow/red/grey) showing the last-known sync health for Regular Season, Playoffs, Playdowns, MHR Games, and MHR Rankings.

Both features share a new `/api/team-status` endpoint that computes status snapshots from existing DB data efficiently in a single bulk query pass rather than per-team requests.

---

## Files to Create

- `app/admin/sync/page.tsx` — Bulk sync page
- `app/api/team-status/route.ts` — Status snapshot API for all teams

## Files to Modify

- `app/admin/teams/page.tsx` — Add status strip to each team card; add nav link to bulk sync page
- `app/admin/dashboard/page.tsx` — Add nav link to bulk sync page in sidebar
- `app/globals.css` — New CSS classes for status strip and bulk sync page layout

---

## Prerequisites

- No DB migrations needed — all required data is already in existing tables
- Auth pattern follows the existing `/api/owha-sync` model (service role client after session verification)

---

## Implementation Phases

### Phase 1 — `/api/team-status` endpoint

**File:** `app/api/team-status/route.ts`

This endpoint accepts a POST with `{ teamIds: string[] }` and returns a status object per team. It is called once on page load and again after each sync completes to refresh a single team.

**Data fetched in parallel for all teams at once:**
- `teams` table: `id`, `owha_url_regular`, `owha_last_synced_at`
- `playdowns` table: `team_id`, `owha_url`, `owha_last_synced_at`
- `mhr_config` table: `team_id`, `team_nbr`, `div_nbr`, `last_synced_at`, `rankings_last_synced_at`
- `standings` table: `team_id`, `standings_type`, `rows`, `updated_at`
- `games` table: `team_id`, `game_type`, `result`, `played` (only played games for mismatch calc)

**Status logic per indicator:**

| Indicator | Grey condition | Red condition | Yellow condition | Green condition |
|---|---|---|---|---|
| Regular Season | no `owha_url_regular` | never synced | standings mismatch | synced + match |
| Playoffs | no `owha_url_regular` | never synced | — | synced |
| Playdowns | no playdowns `owha_url` | never synced | — | synced |
| MHR Games | no `team_nbr` in mhr_config | never synced | — | synced |
| MHR Rankings | no `div_nbr` in mhr_config | never synced | — | synced |

**Mismatch calculation for Regular Season** (reuses same logic as individual overview page):
- From games: count W/L/T/GP for `game_type = "regular"` and `played = true`
- From standings: find the row matching `org + name` using the same normalization logic already used throughout the codebase
- If game-derived record differs from standings record → yellow

**Response shape:**
```
{
  [teamId]: {
    regular: "green" | "yellow" | "red" | "grey",
    playoffs: "green" | "red" | "grey",
    playdowns: "green" | "red" | "grey",
    mhrGames: "green" | "red" | "grey",
    mhrRankings: "green" | "red" | "grey",
  }
}
```

Auth: verify session + super_admin role before proceeding (same pattern as owha-sync).

---

### Phase 2 — Status strip on `/admin/teams`

**File:** `app/admin/teams/page.tsx`

**New state:**
- `statusMap: Record<string, TeamStatus>` — keyed by team ID, populated after initial load
- `statusLoading: boolean`

**On mount** (after teams load): call `POST /api/team-status` with all team IDs. Populate `statusMap`.

**New `TeamStatusStrip` component** (defined in the same file):
- Renders 5 small coloured dots/chips with labels: Regular, Playoffs, Playdowns, MHR, Rankings
- Colours: green = `#16a34a`, yellow = `#ca8a04`, red = `#dc2626`, grey = muted foreground
- Compact — sits below the team name row inside each team card
- Shows a small "Refreshing…" state when a single team is being re-fetched

**`refreshTeamStatus(teamId)` function:**
- Calls `POST /api/team-status` with `{ teamIds: [teamId] }`
- Merges result into `statusMap` for just that team
- Called after any sync completes on the bulk sync page (passed down as a callback) — but on the teams page itself, it is also exported so the bulk sync page can invoke it after each team sync

Since the two pages are separate routes, the status refresh after bulk sync is handled differently: the bulk sync page (`/admin/sync`) maintains its own copy of team statuses and updates them inline. The `/admin/teams` page status is only refreshed when that page is loaded or when a sync is triggered from within it (not cross-page communication).

---

### Phase 3 — Bulk sync page (`/admin/sync`)

**File:** `app/admin/sync/page.tsx`

**Page layout:**
- Super admin only (redirect to `/admin/dashboard` if not)
- Sidebar matches the pattern from `/admin/teams` (same `ob-layout`, `ob-sidebar`, `ob-content` structure)
- Add "Bulk Sync" nav link in sidebar, marked active on this page

**Sync type buttons** — a row of buttons at the top, one per type:
- Regular Season Games
- Regular Season Standings
- Playoffs Games
- Playoffs Standings
- Playdowns Games
- Playdowns Standings
- MHR Games
- MHR Rankings

Only one sync type can run at a time. While running, all other type buttons are disabled.

**Team list** — a table/list of all teams with columns:
- Team name
- Config status (shows "Not configured" in grey if the team has no URL for the selected type)
- Result (blank until sync runs, then shows: "0 added · 0 updated · 0 unchanged", or error text, or "Skipped — not configured")
- Status dot (updates live after each team's sync completes)

**Sync execution logic (`runBulkSync(type)`):**
1. Set `running = true`, reset all result rows
2. For each team in order:
   a. Check if team is configured for this sync type — if not, mark as skipped, continue
   b. Build the request body for `/api/owha-sync` or `/api/mhr-sync` matching the existing per-team sync format
   c. `await fetch(...)` the sync API
   d. Update that team's result row with the response data
   e. Call `refreshTeamStatus(teamId)` to update its status dot
   f. `await sleep(400)` — 400ms delay before next team
3. Set `running = false`

**Configuration check per sync type:**
- Regular Season Games / Standings / Playoffs Games / Playoffs Standings → requires `owha_url_regular` on teams table
- Playdowns Games / Standings → requires `playdowns.owha_url` for that team
- MHR Games → requires `mhr_config.team_nbr`
- MHR Rankings → requires `mhr_config.div_nbr`

These config values are fetched on page load alongside the team list (single bulk query each).

**Progress indicator:** "Syncing 3 of 8 teams…" shown while running, "Done" when complete.

---

### Phase 4 — Navigation updates

**`app/admin/dashboard/page.tsx`:**
- Add "Bulk Sync" nav link in the sidebar bottom section, visible only to super admins
- Use `RefreshCw` icon from Lucide

**`app/admin/teams/page.tsx`:**
- Add "Bulk Sync" nav link in the sidebar alongside the existing "Manage Teams & Admins" link

---

### Phase 5 — CSS

**`app/globals.css`:**

New classes needed:
- `.team-status-strip` — flex row, gap, padding below team name
- `.status-dot` — small circle (10–12px), coloured by state via modifier classes
- `.status-dot-green`, `.status-dot-yellow`, `.status-dot-red`, `.status-dot-grey`
- `.status-dot-label` — tiny text label below or beside dot
- `.bulk-sync-type-bar` — horizontal row of sync type buttons at top of bulk sync page
- `.bulk-sync-team-row` — each team row in the bulk sync list
- `.bulk-sync-result` — result text styling (muted for skipped, green for success, red for error)
- `.bulk-sync-progress` — progress line styling

---

## Data Flow Summary

```
/admin/teams loads
  → POST /api/team-status (all team IDs)
  → statusMap populated
  → status strips render on each card

/admin/sync loads
  → fetch all teams + config data
  → user clicks sync type button
  → runBulkSync() iterates teams sequentially
  → per-team: POST /api/owha-sync or /api/mhr-sync
  → per-team: POST /api/team-status (single team)
  → result row + status dot update live
  → 400ms pause → next team
```

---

## Risks & Considerations

- **Auth on `/api/team-status`**: Must verify super_admin role — this endpoint returns aggregate data across all teams and should not be accessible to team admins.
- **Bulk query efficiency**: The status endpoint fetches games for all teams at once with `.in("team_id", teamIds)` — for 10–15 teams this is fine, but avoid N+1 queries.
- **Playdowns config fetch**: The bulk sync page needs to know which teams have a playdowns URL. This requires a query to the `playdowns` table on page load. Use `.in("team_id", allTeamIds)` rather than per-team.
- **MHR config fetch**: Similar — one query to `mhr_config` with all team IDs.
- **Playoffs "not configured" distinction**: All teams share `owha_url_regular` for both regular and playoffs — so if regular is configured, playoffs is also considered configured (not grey). A team with no regular URL would be grey for both.
- **The 400ms delay**: This is client-side via `await new Promise(r => setTimeout(r, 400))` — simple and reliable.
- **No new sync logic**: The bulk sync page is purely a UI orchestrator over the existing API routes. No sync behaviour changes.
