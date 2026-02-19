# Spec for Standings Mode Dropdown

branch: claude/feature/standings-dropdown

## Summary

- Replace the static "Regular Season" title on the standings page (`regular-season/page.tsx`) with a dropdown selector
- Dropdown options: "Regular Season" and "Playdowns"
- Selecting a mode switches the entire page context: record card, standings table, and game list all update to reflect the chosen mode
- Default selection is "Regular Season" (current behavior)

## Functional Requirements

### Dropdown Selector

- Replaces the current `<h1>Regular Season</h1>` heading with a styled dropdown
- Options: "Regular Season", "Playdowns"
- Dropdown should feel native to the existing design (use existing form/input styling patterns)
- Selected value persists only for the session (no localStorage needed)

### Regular Season Mode (existing behavior)

- Record card shows OWHA standings record (or local computed record as fallback)
- Standings table shows OWHA imported standings rows
- Game list shows all played games with `gameType === "regular"`
- Search/filter and opponent click behavior unchanged

### Playdowns Mode

- Record card shows the "self" team's playdown record (W-L-T and GP) computed from `computePlaydownStandings()`
- Standings table shows playdown standings for all teams in the playdown config, using `computePlaydownStandings()` output
- Highlight the "self" row in the standings table (same pattern as Regular Season highlights the user's team)
- Game list shows playdown games, displaying opponent name, date, location, score, and result
- Search/filter behavior should work the same way against playdown games
- If no playdown is configured for the team, the "Playdowns" option should either be hidden from the dropdown or show a "No playdown data" empty state

### Shared Behavior

- The back link, scroll fade indicators, and page layout structure remain the same regardless of mode
- The opponent click-to-filter and search bar work identically in both modes

## Possible edge cases

- Team has no playdown configured — hide the Playdowns option or show empty state
- Team has a playdown but no games played yet — show standings with all zeros and empty game list
- Switching modes while a search filter is active — clear the search/filter when mode changes

## Acceptance Criteria

- Dropdown replaces the "Regular Season" title and toggles between modes
- In Regular Season mode, page behaves exactly as it does today
- In Playdowns mode, record card, standings, and game list all reflect playdown data
- Playdowns standings use existing `computePlaydownStandings()` from `lib/playdowns.ts`
- If no playdown exists, the dropdown either omits the option or shows an appropriate empty state
- Design is consistent with the existing page styling

## Open questions

- Should the dropdown include future event types (e.g., Tournaments) or just these two for now?
- Should the URL/route change when switching modes (e.g., query param) or stay the same?

## Testing Guidelines

Create a test file(s) in the ./tests folder for the new feature, and create meaningful tests for the following cases, without going too heavy:

- No test framework is configured, so skip this section

## Planning instructions

Save the plan to /.claude/plans/ and give it the same name as the source .md spec file that was input just change the ".md" to "-plan.md"

## Final output to the user

After the file is saved, respond to the user with the name of the file.

Do not repeat the full spec in the chat output unless the user explicitly asks to see it. The main goal is to save the plan file and report where it lives and what branch name to use.
