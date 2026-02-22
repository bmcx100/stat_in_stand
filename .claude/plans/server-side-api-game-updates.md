# Plan: OWHA Automated Score Sync

## Overview

Build a system that fetches game results from OWHA's public HTML pages and upserts them into Supabase. Syncing is triggered manually by an admin via buttons on the team overview page. Each team stores its own OWHA URLs — one for regular season (on the team record itself), and one per OWHA-linked event (playdown or tournament). No separate divisions concept or new admin section is needed.

---

## Step 1 — Database: Add `owha_game_id` to `games` table

Add a nullable `owha_game_id` text column to the existing `games` table.

- Nullable — existing manually-entered and non-OWHA games are unaffected
- Add a unique constraint on `(team_id, owha_game_id)` to prevent duplicates on upsert

---

## Step 2 — Database: Add OWHA URL to `teams` table

Add a single nullable `owha_url_regular` text column to the `teams` table.

This stores the full OWHA URL for that team's regular season games page (e.g. `https://www.owha.on.ca/division/0/27225/games`). Left null if not configured.

---

## Step 3 — Database: Add OWHA fields to `playdowns` and `tournaments` tables

Add two nullable columns to both `playdowns` and `tournaments`:

- `owha_event` — boolean, default false. Marks this event as OWHA-sourced and enables the sync controls.
- `owha_url` — text nullable. The OWHA URL for this specific event's games page.

---

## Step 4 — Admin UI: Events Setup — Add "OWHA Event" Toggle

In the existing Events Setup UI (where admins create/edit playdowns and tournaments), add:

- An "OWHA Event" checkbox/toggle
- When checked, reveal a text input for the OWHA URL for that event

This applies to both playdown setup and tournament setup forms.

---

## Step 5 — Admin UI: Team Overview Page — Regular Season Section

On the team overview page (`app/admin/team/[slug]/page.tsx`), add a **Regular Season OWHA Sync** section.

This section contains:
- A text input to enter/edit the `owha_url_regular` for the team (with a save button)
- A **"Sync OWHA Scores"** button (disabled if no URL is set)
- Three stat tiles:
  - **OWHA Games Scored** — count of games in `games` table for this team where `owha_game_id` is not null and result is not null
  - **OWHA Games Scheduled** — count of games where `owha_game_id` is not null and result is null
  - **Last Sync** — timestamp of the most recent sync run (stored locally in state after a sync, or persisted — see Step 7)

---

## Step 6 — Admin UI: Team Overview Page — OWHA Events Sections

Below the Regular Season section, for each active playdown or tournament that has `owha_event = true`, render a separate sync section.

Each section shows:
- The event name (e.g. "2026 OWHA Playdowns")
- The configured OWHA URL (read-only display — edited via the Events Setup page)
- A **"Sync OWHA Scores"** button
- The same three stat tiles: OWHA Games Scored / OWHA Games Scheduled / Last Sync

These sections only appear if the team has at least one OWHA-enabled event.

---

## Step 7 — Database: Last Sync Tracking

To persist "Last Sync" across sessions, add a nullable `owha_last_synced_at` timestamptz column to the `teams` table (covers regular season syncs).

For event syncs, add `owha_last_synced_at` to both `playdowns` and `tournaments` tables.

Update these timestamps in the API route after a successful sync.

Include all schema changes from Steps 1–3 and this step in a single migration: `supabase/migrations/003_owha_sync.sql`

---

## Step 8 — API Route: OWHA Sync Endpoint

Create `app/api/owha-sync/route.ts` as a POST endpoint.

### Request body variants:

**Regular season sync:**
```json
{ "teamId": "<uuid>", "type": "regular" }
```

**Event sync:**
```json
{ "teamId": "<uuid>", "type": "event", "eventType": "playdown" | "tournament", "eventId": "<uuid>" }
```

### What it does:

1. Verifies the caller is an authenticated admin (check Supabase session server-side)
2. Looks up the team record and resolves the correct OWHA URL based on request type
3. Fetches the OWHA HTML page server-side
4. Parses the `<tbody aria-live="polite">` table — extracts: owha_game_id, date, location, home team name + score, visitor team name + score, notes
5. Filters parsed games to only those where home or visitor team name matches the team being synced (fuzzy match against team `name` field — OWHA format is "Team Name #XXXX")
6. For each matched game:
   - Determines if the tracked team was home or visitor
   - Calculates result (W/L/T) if both scores are present
   - Uses existing `normalizeDate()` from `lib/parsers.ts` for date formatting
   - Matches or creates opponent using existing `matchOpponent()` from `lib/parsers.ts`
   - Upserts into `games` table on `(team_id, owha_game_id)`:
     - New game: insert with correct `game_type` (regular/playdowns/provincials based on request type)
     - Existing game: update scores and result only if scores are now available (never blank out existing scores)
7. Updates `owha_last_synced_at` on the team or event record
8. Returns: `{ updated: N, inserted: N, skipped: N, errors: [] }`

---

## Step 9 — Handle Edge Cases

- **Manually entered games**: never overwrite a game where `owha_game_id` is null — those are manual entries
- **Score removal by OWHA**: only write scores, never blank them via sync
- **Duplicate prevention**: unique constraint on `(team_id, owha_game_id)` handles this at DB level; API uses upsert
- **No team match found on page**: if the team can't be found in any row on the OWHA page, return a clear error (likely wrong URL configured)
- **OWHA page structure change**: parser fails gracefully, returns error in summary rather than crashing
- **URL not configured**: sync button is disabled in the UI; API also validates and returns 400 if URL is missing

---

## Step 10 — Implementation Order

1. Write and apply `003_owha_sync.sql`
2. Build and test the API route with a known team + URL
3. Update Events Setup forms to add OWHA toggle + URL field
4. Build the Regular Season sync section on the team overview page
5. Build the OWHA Events sync sections on the team overview page
6. Test end-to-end with one real team

---

## What Is NOT in Scope

- Automated/scheduled syncing — manual only
- Syncing standings from OWHA — existing import flow handles that
- Exhibition or tournament games from non-OWHA sources
- Modifying existing manual game entry or import flows
