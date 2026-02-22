# Spec 9: MHR Sync — Games & Provincial Rankings

## Overview

Integrate My Hockey Rankings (MHR) as a sync source for exhibition games, tournament games, and provincial rankings. MHR is the only source for provincial rankings, and it provides richer game data than OWHA (home/visitor distinction, rink names). OWHA remains authoritative for regular season, playoffs, and playdowns — MHR sync skips those game types entirely.

## Background & API Discovery

MHR's API requires a per-session token embedded in the page HTML. There is no static token — each page load generates a fresh one for anonymous sessions. The sync flow must:
1. Fetch the MHR HTML page server-side
2. Extract the token via regex from the `MHRv5.*token:"..."` script block
3. Use that token in the `X-Mhr-Token` request header when calling the service endpoint

### Games

- **Page URL:** `https://myhockeyrankings.com/team_info.php?y={year}&t={teamNbr}`
- **Service URL:** `https://myhockeyrankings.com/team-info/service/{year}/{teamNbr}`
- **Token location in HTML:** `MHRv5.scoresBody(..., { ..., "token":"..." })`
- **Response:** flat JSON array of game objects

**Game type mapping:**
| MHR `game_type` | Our `gameType` |
|---|---|
| `"e"` | `exhibition` |
| `"t"` | `tournament` |
| `"p"` | **skip** (playoffs/playdowns — handled by OWHA) |
| anything else | **skip** |

**Key game fields:**
- `game_nbr` — unique game ID (use as `sourceGameId`)
- `game_date_format` — ISO date string (`2025-09-11`)
- `game_time_format` — 24h time string (`19:15`)
- `game_home_team` / `game_visitor_team` — team numbers; compare to stored `mhr_team_nbr` to determine home/away
- `game_home_score` / `game_visitor_score` — `999` means unplayed (treat as null)
- `game_published: 0` — also indicates unplayed
- `home_team_name` / `visitor_team_name` — opponent name is whichever is not our team
- `rink_name` — venue string
- `game_ot` / `game_so` — overtime/shootout flags

**Determining result:** if our team is home, we win if `game_home_score > game_visitor_score`, etc. OT loss when we lose and `game_ot === 1`. SO loss when we lose and `game_so === 1`.

All MHR games go into the main `games` table with `source: "mhr"`.

### Rankings

- **Page URL:** `https://myhockeyrankings.com/rank?y={year}&a={age}&v={divNbr}`
- **Service URL:** `https://myhockeyrankings.com/rank/service?y={year}&a={age}&v={divNbr}`
- **Token location in HTML:** `MHRv5.rankings(..., { ..., "token":"..." })`
- **Response:** flat JSON array of ranked team objects

**Key ranking fields:**
- `ranking` — provincial rank position
- `name` — team name
- `team_nbr` — MHR team ID
- `week` — e.g. `202522` (year + week number)
- `difference` — rank change from previous week (negative = dropped)
- `gp`, `wins`, `losses`, `ties`, `gf`, `ga` — stats
- `rating`, `sched`, `agd` — ranking formula components

Rankings history is built by storing one row per `(team_id, week)` — re-syncing the same week upserts. This allows looking up a team's rank at any point in the season.

## Database Changes

### New columns on `teams` table
- `mhr_team_nbr` INTEGER — MHR team number (e.g. `9407`)
- `mhr_div_nbr` INTEGER — MHR division/rankings number (e.g. `2038`)
- `mhr_div_age` VARCHAR — MHR age code for rankings URL (e.g. `"c"`)
- `mhr_last_synced_at` TIMESTAMPTZ — last games sync timestamp
- `mhr_rankings_last_synced_at` TIMESTAMPTZ — last rankings sync timestamp

### New table: `mhr_rankings`
```sql
CREATE TABLE mhr_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  div_nbr INTEGER NOT NULL,
  week INTEGER NOT NULL,
  rows JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, week)
);
```

RLS: public read, authenticated write scoped to team_admins (same pattern as other tables).

### Migration file
`supabase/migrations/004_mhr_sync.sql`

## Configure Card (Manage Teams & Admins)

In `app/admin/teams/page.tsx`, the Configure expand panel currently has two inputs (OWHA Regular Season URL, OWHA Playdowns URL). Add a third section:

**MHR Games URL**
- Input: full MHR team page URL (e.g. `https://myhockeyrankings.com/team_info.php?y=2025&t=9407`)
- Extract `t` param → save as `mhr_team_nbr`
- Placeholder: `https://myhockeyrankings.com/team_info.php?y=2025&t=9407`

**MHR Rankings URL**
- Input: full MHR rankings page URL (e.g. `https://myhockeyrankings.com/rank?y=2025&a=c&v=2038`)
- Extract `v` param → save as `mhr_div_nbr`, `a` param → save as `mhr_div_age`
- Placeholder: `https://myhockeyrankings.com/rank?y=2025&a=c&v=2038`

Both saved via a new `/api/mhr-config` PATCH endpoint alongside the existing OWHA save. The single Save button covers all four URL inputs. Dirty detection should include the two new MHR inputs.

## New API Route: `/api/mhr-config`

PATCH endpoint to save MHR identifiers extracted from the provided URLs:
- Parse `mhr_team_nbr` from games URL `t` param
- Parse `mhr_div_nbr` and `mhr_div_age` from rankings URL `v` and `a` params
- Update `teams` table via service role client

## New API Route: `/api/mhr-sync`

POST endpoint, analogous to `/api/owha-sync`. Request body:

```ts
{ teamId: string, type: "games" | "rankings" }
```

### `type: "games"`
1. Fetch team row to get `mhr_team_nbr`
2. Fetch `https://myhockeyrankings.com/team_info.php?y={year}&t={mhr_team_nbr}`
3. Extract token via regex: `/MHRv5\.scoresBody\(.*?"token"\s*:\s*"([^"]+)"/s`
4. Call service URL with `X-Mhr-Token` header
5. Parse JSON array — skip `game_type === "p"`, skip scores of 999 (unplayed)
6. Determine home/away by comparing `game_home_team` to `mhr_team_nbr`
7. Map to `Game` objects (`source: "mhr"`, `sourceGameId: String(game_nbr)`)
8. Upsert into `games` table, update `mhr_last_synced_at`
9. Return `{ inserted, updated, skipped }` summary

### `type: "rankings"`
1. Fetch team row to get `mhr_div_nbr` and `mhr_div_age`
2. Fetch `https://myhockeyrankings.com/rank?y={year}&a={mhr_div_age}&v={mhr_div_nbr}`
3. Extract token via regex: `/MHRv5\.rankings\(.*?"token"\s*:\s*"([^"]+)"/s`
4. Call service URL with `X-Mhr-Token` header
5. Parse JSON array — extract `week` from first entry
6. Upsert into `mhr_rankings` table keyed on `(team_id, week)`, update `mhr_rankings_last_synced_at`
7. Return `{ week, teamCount, ourRanking }` where `ourRanking` is our team's rank found by `team_nbr`

Year is inferred from current date using season logic (Aug–Jul span, same as `inferYear()`).

## Admin Overview Page MHR Section

In `app/admin/team/[slug]/page.tsx`, add a new section below the existing three OWHA season cards. Load `mhr_team_nbr`, `mhr_div_nbr`, `mhr_last_synced_at`, `mhr_rankings_last_synced_at` from the `teams` row, and the latest rankings snapshot from `mhr_rankings`.

### MHR Games Card
Mirrors the `SeasonCard` pattern:
- **Left half:** `MhrSyncPanel` — "Sync Games" button + last synced timestamp + result summary
- **Right half:** stats — exhibition game count, tournament game count

No mismatch detection (no standings to compare against).

### MHR Rankings Card
- **Left half:** "Sync Rankings" button + last synced timestamp
- **Right half:** displays our team's current rank (from latest `mhr_rankings` snapshot) — e.g. `#7` with the week label (e.g. "Week 22")

If no rankings have been synced yet, right half shows `—`.

Both cards are disabled (greyed out sync button) if `mhr_team_nbr` / `mhr_div_nbr` are not configured.

## Hook: `useSupabaseMhrRankings(teamId)`

New hook in `hooks/use-supabase-mhr-rankings.ts`:
- Fetches latest row from `mhr_rankings` for this `team_id` ordered by `week DESC`
- Exposes `rankings: MhrRankingRow[] | null` and `latestWeek: number | null`

## Type additions (`lib/types.ts`)

```ts
export type MhrRankingEntry = {
  team_nbr: number
  name: string
  ranking: number
  week: number
  difference: number
  gp: number
  wins: number
  losses: number
  ties: number
  gf: number
  ga: number
  rating: number
  sched: number
  agd: number
}
```

## Parser additions (`lib/parsers.ts`)

New function `parseMhrApiGames(data: unknown[], teamId: string, mhrTeamNbr: number): Game[]`

Replaces the existing text-based `parseMhrGames()` for API-sourced data. The existing function stays for manual paste import.
