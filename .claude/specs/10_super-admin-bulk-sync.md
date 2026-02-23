# Spec for super-admin-bulk-sync

branch: claude/feature/super-admin-bulk-sync

## Summary

Add two super-admin features: a bulk sync page that lets the super admin sync all teams at once by sync type, and a status dashboard embedded in the existing super admin teams page showing each team's sync health and mismatch state at a glance.

## Functional Requirements

### Bulk Sync Page (`/admin/sync`)

- New page accessible only to super admins, linked from the admin dashboard
- Lists all teams in the system
- Provides sync action buttons per type: Regular Season Games, Regular Season Standings, Playoffs Games, Playoffs Standings, Playdowns Games, Playdowns Standings, MHR Games, MHR Rankings
- When a sync type button is clicked, it runs that sync for every team sequentially (not in parallel), with a ~400ms delay between each team request to avoid overwhelming OWHA/MHR APIs
- Teams that have no URL configured for that sync type are skipped gracefully (shown as "Not configured")
- Per-team result rows update live as each sync completes — showing inserted/updated/skipped counts or a clear error message
- A progress indicator shows how many teams have been processed out of total
- The page does not require navigating away or reloading between runs
- Syncs use the existing `/api/owha-sync` and `/api/mhr-sync` API routes — no new sync logic

### Team Status Dashboard (embedded in `/admin/teams`)

- Each team card on the super admin teams page gains a status strip showing sync health indicators
- Indicators cover: Regular Season, Playoffs, Playdowns, MHR Games, MHR Rankings
- Each indicator has four states:
  - **Green** — synced, records match (or no standings to compare against)
  - **Yellow** — synced but standings mismatch detected
  - **Red** — sync error on last attempt, or never synced
  - **Grey** — not configured (no URL set for this sync type)
- Status is based on last-known DB state (not a live fetch on load)
- After a sync completes on the bulk sync page, the status strip for that team updates to reflect the new state without a full page reload
- Mismatch detection reuses the same logic already used on the individual team overview page (compare game-derived W/L/T/GP against stored standings rows)

## Possible Edge Cases

- A team has no OWHA URL configured — skip and mark as grey, do not error
- A team has no MHR config — skip and mark as grey
- A sync returns 0 results (e.g. playoffs not posted yet) — show as green with "0 added" not as an error
- Mid-bulk-sync, one team errors — continue to next team, show that team as red, do not abort the whole run
- Super admin page loads with many teams — status strip data should be fetched efficiently, not one request per team per indicator

## Acceptance Criteria

- Super admin can trigger a full sync of all teams for any sync type from a single page
- Individual team sync results are visible inline as they complete
- Each team card on the super admin teams page shows a colour-coded status strip
- Status strip reflects post-sync state immediately after a bulk or individual sync completes
- No sync errors on one team prevent other teams from being processed
- Teams with missing config are skipped silently (grey state), not errored

## Open Questions

- Should the bulk sync page show a "Sync All Types" button in addition to per-type buttons, or is per-type sufficient?
- Should the status strip on the teams page also appear for team admins on their own overview, or is it super-admin only?
- How should last-sync timestamps factor into the status — e.g. should a team that hasn't synced in 7+ days show yellow even if records match?

## Testing Guidelines

No test framework is configured for this project — manual verification only.

Key scenarios to manually verify:
- Bulk sync runs all teams for a given type and shows per-team results
- A team with no URL configured is skipped and shown as grey
- An error on one team does not stop the rest of the bulk sync
- Status strip updates after sync without page reload
- Mismatch detection correctly highlights yellow vs green

## Planning Instructions

Save the plan to /.claude/plans/ and give it the same name as the source .md spec file that was input just change the ".md" to "-plan.md"

## Final Output to the User

After the file is saved, respond to the user with the name of the file.

Do not repeat the full spec in the chat output unless the user explicitly asks to see it. The main goal is to save the plan file and report where it lives and what branch name to use.
