# Spec for home-card-redesign

branch: claude/feature/home-card-redesign

## Summary

Redesign the home screen favorited team cards and the add-teams browse list to surface live context at a glance. Each team card shows its provincial ranking (`#4`) and one or more active event rows (regular season, playdowns, playoffs, tournament) based on what games are happening within a ±7 day window. Each event row is collapsible — tapping expands it to show the last result, next opponent details, and head-to-head record. Teams with no games in the window fall back to the global app mode set by the super admin.

## Functional Requirements

### Provincial Ranking Badge
- Every place a team is listed (home screen cards, add-teams browse list) shows their current provincial ranking as `#N` if MHR rankings have been synced.
- Teams without MHR configured or no rankings synced show nothing (no empty state needed).
- On hover (desktop) or tap (mobile), a tooltip appears showing e.g. "4th in Ontario — U15 AA" with a link to the full MHR rankings page for that division on myhockeyrankings.com.
- The ranking number comes from the most recently synced `mhr_rankings` row for the team, looking up the team's `team_nbr` in the `rows` JSONB array to find the `ranking` field.
- A graphical badge on the banner image is a future enhancement — not in scope here.

### Active Event Detection
- On page load, fetch all games within a ±7 day window (7 days ago through 7 days from now) for all favorited team IDs in a single query — not per-team.
- Detect which game types are active per team from the result set: `regular`, `playoffs`, `playdowns`, `tournament`.
- A team may have multiple active event types simultaneously (e.g. regular season + a tournament weekend). All active types are shown, not just the top priority.
- If no games fall within the window for a team, the card falls back to displaying the global app mode (fetched from `app_settings` table, key `app_mode`).
- `exhibition` and `provincials` game types are excluded from active event detection for now.

### Event Rows on the Card
- Each active event type renders as a collapsed row below the team banner.
- Collapsed row shows: event type label + one-line summary.
  - Regular: `Regular · 12-4-1 · 3rd of 8`
  - Playoffs: `Playoffs · 2-1 · 4th seed`
  - Playdowns: `Playdowns · Alive · 3-2 · 4th of 6`
  - Tournament: `[Tournament name] · Pool A · 1-0`
- Tapping a collapsed row expands it inline. Only one row can be expanded at a time per card.
- Tapping an already-expanded row collapses it.

### Expanded Event Row Content
- **Last game:** result and opponent name. E.g. `Last: W 4-2 vs Kanata Blazers`
- **Next game:** opponent name, date, time. E.g. `Next: Kanata Blazers · Sat Mar 1 · 7:00pm`
- **Opponent's current standing:** position and record in the same division/loop. E.g. `2nd of 8 · 13-3-1` — sourced from the stored standings JSONB rows.
- **Head-to-head record:** wins-losses-ties against this opponent this season from the games table. E.g. `Season series: 1-1-0`
- If any of these data points are unavailable (no standings synced, opponent name mismatch), that line is omitted silently — no error states shown.
- A small arrow-link `↗` in the expanded row header navigates to the relevant full page (e.g. `/team/[slug]/standings`, `/team/[slug]/playdowns`).

### Add Teams Browse List (`/teams`)
- Each team row in the browse list gains the `#N` ranking badge if available.
- No event rows or expandable content on the browse list — ranking only.

### Data Fetching
- All data for the home screen is fetched in parallel on load: teams, games window, standings, mhr_rankings, app_settings.
- Single bulk query per table — no per-team individual requests.
- Ranking lookup: fetch the latest `mhr_rankings` row per team (by `synced_at desc`), cross-reference `team_nbr` from `mhr_config`.

## Possible Edge Cases

- Team has games of the same type on both sides of the window boundary — should still appear as one event row.
- Team has a tournament game in the window but no matching tournament record in the `tournaments` table — show generic label "Tournament" instead of a named tournament.
- Opponent name from games table doesn't fuzzy-match any row in standings — omit the opponent standing line.
- Multiple tournaments in the window for one team — show one row per tournament (matched by tournament name/id).
- No favorites added yet — existing empty state ("Add Teams") remains unchanged.
- MHR rankings exist but `team_nbr` is not found in the latest rows array — show nothing, don't crash.
- Global app_settings fetch fails — fall back to `playdowns` as hardcoded default.

## Acceptance Criteria

- Home screen cards show `#N` ranking for any team with synced MHR rankings.
- Hovering/tapping the ranking shows a tooltip with division label and a link to the MHR rankings page.
- Cards show one collapsed event row per active game type detected within ±7 days.
- Tapping a collapsed row expands it showing last result, next game, opponent standing, and H2H record.
- Only one row is expanded at a time per card.
- Teams with no games in the window show a single row based on the global app mode fallback.
- Add-teams browse list shows `#N` ranking badges with the same hover/tap behaviour.
- All home screen data loads in a single round-trip per table (no N+1 queries).
- Cards with no ranking data and no active events look identical to the current design (no regressions).

## Open Questions

- Window size: 7 days confirmed, or adjust based on testing?
- For the tournament name label in the collapsed row: should we match by tournament `id` stored on the game, or by fuzzy-matching the opponent names against known tournament rosters?
- Should the expanded row for a tournament link to `/team/[slug]/tournaments/[id]` specifically, or just the events tab?
- H2H record: season only (current games), or all-time?

## Testing Guidelines

- Unit test the active event detection function: given a set of games with dates, confirm correct types are returned for a ±7 day window.
- Unit test the ranking lookup: given a `mhr_rankings` rows array and a `team_nbr`, confirm correct rank is returned and null is returned when not found.
- Unit test H2H record calculation: given a games array with opponent names, confirm correct W-L-T against a named opponent.

## Planning Instructions

Save the plan to /.claude/plans/ and give it the same name as the source .md spec file that was input just change the ".md" to "-plan.md"

## Final Output to the User

After the file is saved, respond to the user with the name of the file.

Do not repeat the full spec in the chat output unless the user explicitly asks to see it. The main goal is to save the plan file and report where it lives and what branch name to use.
