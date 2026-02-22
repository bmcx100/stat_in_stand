# Implementation Plan: MHR Sync — Games & Provincial Rankings

## Overview

This plan integrates My Hockey Rankings (MHR) as a new sync source for exhibition and tournament games, plus a new provincial rankings system. MHR complements OWHA: OWHA owns regular season, playoffs, and playdowns; MHR owns exhibition, tournament, and provincial rankings. The implementation follows the exact same layered architecture as the OWHA sync system — database migration first, API routes second, UI last.

Key architectural notes:
- MHR requires a per-session token extracted from the HTML page before calling the data service endpoint. This is the primary novelty versus OWHA.
- Games sync goes into the existing `games` table (already has `source: "mhr"` in the `ImportSource` union). Rankings go into a new `mhr_rankings` table.
- The year used in MHR URLs must be derived from the current date using the existing hockey season logic (Aug–Jul span).
- The existing `games` unique index on `(team_id, source_game_id)` will also cover MHR games — no new index needed.

---

## Phase 1: Database Migration

**File to create:** `supabase/migrations/004_mhr_sync.sql`

### New columns on `teams` table:
```sql
alter table teams
  add column if not exists mhr_team_nbr integer,
  add column if not exists mhr_div_nbr integer,
  add column if not exists mhr_div_age varchar,
  add column if not exists mhr_last_synced_at timestamptz,
  add column if not exists mhr_rankings_last_synced_at timestamptz;
```

### New `mhr_rankings` table:
```sql
create table mhr_rankings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  div_nbr integer not null,
  week integer not null,
  rows jsonb not null,
  synced_at timestamptz not null default now(),
  unique (team_id, week)
);

alter table mhr_rankings enable row level security;
```

### RLS policies for `mhr_rankings` — follow the same pattern as `standings` in `002_rls.sql`:
- Public read (anon + authenticated)
- Team admin insert/update/delete (super_admin or matching team_id in `team_admins`)

---

## Phase 2: Type Additions

**File to modify:** `lib/types.ts`

Add `MhrRankingEntry` type. This represents one entry in the `rows` JSONB blob stored in `mhr_rankings`.

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

---

## Phase 3: Parser Addition

**File to modify:** `lib/parsers.ts`

Add new exported function `parseMhrApiGames()` after the existing `parseMhrGames()` (around line 387). The existing text-based function stays untouched.

```ts
export function parseMhrApiGames(
  data: unknown[],
  teamId: string,
  mhrTeamNbr: number
): Game[]
```

Logic:
1. Define a local `MhrApiGame` interface covering the relevant fields.
2. Skip entries where `game_type === "p"` (playoffs/playdowns — OWHA owns these).
3. Only process `"e"` (exhibition) and `"t"` (tournament); skip all other types.
4. Map MHR `game_type` → our `GameType`: `"e"` → `"exhibition"`, `"t"` → `"tournament"`.
5. Determine home/away: `Number(game.game_home_team) === mhrTeamNbr` (cast to number to avoid type mismatch).
6. Determine opponent name from `home_team_name` / `visitor_team_name` based on home/away.
7. Parse scores: treat `999` as unplayed (null). Also use `game_published === 0` as secondary unplayed signal.
8. Determine result: compare team score vs opponent score. Use `"L"` for both OT loss (`game_ot === 1`) and SO loss (`game_so === 1`) — the `Game.result` union only supports `"W" | "L" | "T" | null`.
9. Return `Game[]` with `source: "mhr"`, `sourceGameId: String(game_nbr)`.

This function does NOT handle opponent registry matching — that's done in the API route.

---

## Phase 4: New API Route — `/api/mhr-config`

**File to create:** `app/api/mhr-config/route.ts`

PATCH endpoint modeled after `app/api/owha-config/route.ts`.

Request body: `{ teamId: string, mhr_games_url?: string, mhr_rankings_url?: string }`

Logic:
1. Validate `teamId`.
2. Auth check — same pattern as `owha-config`: verify `team_admins` membership or `super_admin` role.
3. Create service role Supabase client.
4. Parse MHR Games URL: extract `t` query param → `mhr_team_nbr` (integer or null if blank).
5. Parse MHR Rankings URL: extract `v` param → `mhr_div_nbr`, `a` param → `mhr_div_age` (or nulls if blank).
6. Batch both updates into one `teams` update call.
7. Return `{ success: true }` or error.

URL parsing:
```ts
const url = new URL(mhr_games_url)
const mhr_team_nbr = parseInt(url.searchParams.get("t") ?? "", 10) || null
```

---

## Phase 5: New API Route — `/api/mhr-sync`

**File to create:** `app/api/mhr-sync/route.ts`

POST endpoint modeled after `app/api/owha-sync/route.ts`.

Request body: `{ teamId: string, type: "games" | "rankings" }`

### Shared setup:
1. Validate `teamId` and `type`.
2. Auth check — same pattern as owha-sync.
3. Create service role client.
4. Fetch team row including all new MHR columns.

### Year derivation helper (local function):
```ts
function currentMhrYear(): number {
  const now = new Date()
  const month = now.getMonth() + 1 // 1-12
  return month >= 8 ? now.getFullYear() : now.getFullYear() - 1
}
```

### Token extraction helper (local async function):
```ts
async function fetchMhrToken(pageUrl: string, pattern: RegExp): Promise<string>
```
1. Fetch HTML page with browser-like `User-Agent` header.
2. Match the provided pattern against the HTML text.
3. Return captured group 1 (the token) or throw with a clear error message.

Token regex patterns:
- Games: `/MHRv5\.scoresBody\(.*?"token"\s*:\s*"([^"]+)"/s`
- Rankings: `/MHRv5\.rankings\(.*?"token"\s*:\s*"([^"]+)"/s`

### `type: "games"` handler:
1. Guard: return 400 if `mhr_team_nbr` is null.
2. Fetch page HTML, extract token.
3. Call `https://myhockeyrankings.com/team-info/service/${year}/${mhr_team_nbr}` with `X-Mhr-Token` header.
4. Parse JSON → call `parseMhrApiGames(data, teamId, mhr_team_nbr)`.
5. Fetch opponents registry for this team.
6. Define `findOrBuildOpponent()` — fuzzy name match, same as owha-sync but without OWHA ID logic.
7. Loop over parsed games: check existence by `(team_id, source_game_id, source: "mhr", game_type)`.
   - If exists and newly has scores: update.
   - If not exists: insert.
   - Track `inserted`, `updated`, `skipped`, `errors`.
8. Update `mhr_last_synced_at` on `teams`.
9. Return `{ inserted, updated, skipped, errors }`.

### `type: "rankings"` handler:
1. Guard: return 400 if `mhr_div_nbr` or `mhr_div_age` is null.
2. Fetch page HTML, extract token.
3. Call `https://myhockeyrankings.com/rank/service?y=${year}&a=${mhr_div_age}&v=${mhr_div_nbr}` with `X-Mhr-Token` header.
4. Parse JSON array.
5. Extract `week` from `data[0].week`.
6. Upsert into `mhr_rankings`: `{ team_id, div_nbr, week, rows, synced_at }` with conflict on `(team_id, week)`.
7. Update `mhr_rankings_last_synced_at` on `teams`.
8. Find our team's rank: `data.find(r => r.team_nbr === mhr_team_nbr)?.ranking ?? null`.
9. Return `{ week, teamCount: data.length, ourRanking }`.

---

## Phase 6: Hook — `useSupabaseMhrRankings`

**File to create:** `hooks/use-supabase-mhr-rankings.ts`

Follows the same `useState` + `useEffect` pattern as `useSupabaseStandings`.

- Fetches latest row from `mhr_rankings` for `team_id` ordered by `week DESC`, limit 1.
- Exposes `rankings: MhrRankingEntry[] | null`, `latestWeek: number | null`, `loading: boolean`.
- No mutation functions needed — rankings are write-only from the sync API.

---

## Phase 7: Configure Card Extension

**File to modify:** `app/admin/teams/page.tsx`

### Local `Team` type:
Add `mhr_team_nbr: number | null`, `mhr_div_nbr: number | null`, `mhr_div_age: string | null`.

### New state:
```ts
const [configMhrGamesUrls, setConfigMhrGamesUrls] = useState<Record<string, string>>({})
const [configMhrRankingsUrls, setConfigMhrRankingsUrls] = useState<Record<string, string>>({})
const [configOriginalMhrGamesUrls, setConfigOriginalMhrGamesUrls] = useState<Record<string, string>>({})
const [configOriginalMhrRankingsUrls, setConfigOriginalMhrRankingsUrls] = useState<Record<string, string>>({})
```

### When configure panel opens (Configure button onClick):
Pre-populate MHR URL fields by reconstructing from stored integers:
```ts
const mhrGamesUrl = team.mhr_team_nbr
  ? `https://myhockeyrankings.com/team_info.php?y=${currentYear}&t=${team.mhr_team_nbr}`
  : ""
const mhrRankingsUrl = team.mhr_div_nbr
  ? `https://myhockeyrankings.com/rank?y=${currentYear}&a=${team.mhr_div_age}&v=${team.mhr_div_nbr}`
  : ""
setConfigMhrGamesUrls((prev) => ({ ...prev, [team.id]: mhrGamesUrl }))
setConfigOriginalMhrGamesUrls((prev) => ({ ...prev, [team.id]: mhrGamesUrl }))
setConfigMhrRankingsUrls((prev) => ({ ...prev, [team.id]: mhrRankingsUrl }))
setConfigOriginalMhrRankingsUrls((prev) => ({ ...prev, [team.id]: mhrRankingsUrl }))
```

### `handleSaveConfig` changes:
Add third `fetch` to `Promise.all()`:
```ts
fetch("/api/mhr-config", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    teamId: team.id,
    mhr_games_url: configMhrGamesUrls[team.id] ?? "",
    mhr_rankings_url: configMhrRankingsUrls[team.id] ?? "",
  }),
})
```
After save, update `configOriginalMhrGamesUrls` and `configOriginalMhrRankingsUrls`.

### Dirty detection:
Extend `isDirty` to include the two new MHR URL comparisons.

### Configure panel JSX:
Add two new inputs after the Playdowns URL section and before the Save button:
- "MHR Games URL" input (placeholder: `https://myhockeyrankings.com/team_info.php?y=2025&t=9407`)
- "MHR Rankings URL" input (placeholder: `https://myhockeyrankings.com/rank?y=2025&a=c&v=2038`)

---

## Phase 8: Admin Overview Page — MHR Section

**File to modify:** `app/admin/team/[slug]/page.tsx`

### New state:
```ts
const [mhrTeamNbr, setMhrTeamNbr] = useState<number | null>(null)
const [mhrDivNbr, setMhrDivNbr] = useState<number | null>(null)
const [mhrLastSynced, setMhrLastSynced] = useState<string | null>(null)
const [mhrRankingsLastSynced, setMhrRankingsLastSynced] = useState<string | null>(null)
```

### Hook:
```ts
const { rankings, latestWeek } = useSupabaseMhrRankings(team.id)
```

### Teams select extension:
Add `mhr_team_nbr, mhr_div_nbr, mhr_last_synced_at, mhr_rankings_last_synced_at` to the existing `teams` select in `useEffect`.

### Our rank:
```ts
const ourRanking = rankings?.find((r) => r.team_nbr === mhrTeamNbr)?.ranking ?? null
```

### New `MhrSyncPanel` component:
Similar to `SyncPanel` but calls `/api/mhr-sync`. Accepts:
```ts
{ teamId: string; syncType: "games" | "rankings"; initialLastSynced: string | null; disabled: boolean }
```
- Single button: "Sync Games" or "Sync Rankings"
- Shows last synced timestamp
- Shows result summary inline after success
- Button disabled + greyed out when `disabled` prop is true

### Two new cards in JSX (after existing three SeasonCards):

**MHR Games Card** — left half: `MhrSyncPanel` with `syncType="games"`, disabled if no `mhrTeamNbr`; right half: exhibition game count + tournament game count (filtered by `source === "mhr"`).

**MHR Rankings Card** — left half: `MhrSyncPanel` with `syncType="rankings"`, disabled if no `mhrDivNbr`; right half: current rank (`#7`) + week label (`Wk 22`) from latest snapshot, or `—` if no rankings synced.

Week display: `String(latestWeek).slice(-2)` to get the two-digit week number from `202522` → `"22"`.

---

## File Summary

| File | Action | Phase |
|---|---|---|
| `supabase/migrations/004_mhr_sync.sql` | Create | 1 |
| `lib/types.ts` | Modify — add `MhrRankingEntry` | 2 |
| `lib/parsers.ts` | Modify — add `parseMhrApiGames()` | 3 |
| `app/api/mhr-config/route.ts` | Create | 4 |
| `app/api/mhr-sync/route.ts` | Create | 5 |
| `hooks/use-supabase-mhr-rankings.ts` | Create | 6 |
| `app/admin/teams/page.tsx` | Modify — MHR URL inputs + save | 7 |
| `app/admin/team/[slug]/page.tsx` | Modify — MHR Games + Rankings cards | 8 |

---

## Dependencies and Sequencing

Phases must be implemented in order:

1. **Migration first** — all subsequent code depends on the new columns and table.
2. **Types before parsers, hooks, and routes** — `MhrRankingEntry` is used downstream.
3. **Parsers before mhr-sync route** — route imports `parseMhrApiGames`.
4. **API routes before UI** — configure card and overview page call these endpoints.
5. **Hook before overview page** — overview page uses `useSupabaseMhrRankings`.
6. **UI phases (7 and 8) last** — can be implemented in parallel once backend is done.

---

## Risks and Considerations

**Token extraction fragility.** The regex depends on `MHRv5.scoresBody` / `MHRv5.rankings` function names staying stable. Add a code comment explaining how to re-find the token in DevTools if sync breaks after an MHR frontend update.

**Unique index collision.** The existing `games` unique index on `(team_id, source_game_id)` is source-agnostic. MHR `game_nbr` and OWHA `GID` are from different systems and unlikely to collide, but if an insert fails with a unique violation this is the first place to check. The existence check in the sync loop correctly scopes by `source: "mhr"`, but the DB constraint does not.

**MHR year in URL.** Must use season-start year (Aug–Jul). `currentMhrYear()` helper handles this. Consider importing from `lib/season.ts` rather than duplicating logic.

**Numeric type casting.** `game_home_team` / `game_visitor_team` in MHR JSON may deserialize as numbers or strings depending on serialization. Always cast with `Number()` before comparing to `mhrTeamNbr`.

**Rankings `ourRanking` requires `mhr_team_nbr`.** If only rankings URL is configured (no games URL), `mhrTeamNbr` will be null and `ourRanking` will be null. Display `—` in that case — acceptable behavior.

**`mhr_rankings` JSONB size.** Each snapshot stores all ~100 teams in the division. Over a season of ~30 weeks, that's ~3000 team-ranking entries per team in the database. Acceptable but worth noting.

**CSS.** All existing CSS classes from the OWHA sync cards apply directly to the MHR cards. No new styles needed.
