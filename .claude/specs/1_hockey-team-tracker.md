# Spec for Hockey Team Tracker

branch: claude/feature/hockey-team-tracker

## Summary

- A mobile hockey team tracking app centered around the Nepean Wildcats organization. Even on desktop force the screen size to stay max width of a mobile device.
- Users land on a team selection screen showing their previously favorited teams
- Users can tap a favorited team to enter that team's dashboard
- A subtle "Add Teams" button allows users to browse and favorite additional teams
- Teams are organized by age group (U13, U15) and competitive level (BB, A, AA)
- Teams display as wide horizontal cards stretching near edge-to-edge

## Functional Requirements

- **Initial Team Selection Screen (Home)**
  - On load, display the user's previously favorited teams as horizontal cards
  - Cards should stretch from near-edge to near-edge of the viewport
  - Each card should display the team name including age group and level (e.g., "Nepean Wildcats U13 BB")
  - Tapping a favorited team card navigates to that team's dashboard
  - A subtle/understated "Add Teams" button is visible, allowing navigation to the team browser

- **Add Teams Screen (Team Browser)**
  - Displays the full list of available Nepean Wildcats teams
  - Teams are a combination of age groups and levels:
    - Ages: U13, U15
    - Levels: BB, A, AA
    - Full list: U13 BB, U13 A, U13 AA, U15 BB, U15 A, U15 AA
  - Each team entry has a heart icon that can be toggled to favorite/unfavorite
  - Users can select multiple teams by toggling hearts
  - A "Done" button at the bottom returns the user to the initial team selection screen
  - Newly favorited teams should appear on the team selection screen upon return

- **Team Dashboard**
  - Accessible by tapping a favorited team from the home screen
  - Placeholder/scaffold for now — will be expanded in future specs

- **Favorites Persistence**
  - Favorited teams should persist across sessions (local storage or similar)

## Possible edge cases

- User has no favorited teams on first launch — show empty state with prompt to add teams. A: just go straight to add teams.
- User unfavorites all teams from the browser — return to empty state on home screen. A: No favourites goes straight to add teams.
- User taps "Done" without selecting any teams — return to home screen unchanged. A: Button disabled when no teams selected.
- Duplicate favorite toggles — ensure toggling is idempotent and state stays consistent

## Acceptance Criteria

- Landing screen shows only favorited teams as horizontal, near-full-width cards
- Tapping a team card navigates to the team dashboard
- "Add Teams" button is visible but subtle/understated on the home screen
- Add Teams screen lists all 6 Nepean Wildcats team variants (U13 BB, U13 A, U13 AA, U15 BB, U15 A, U15 AA)
- Heart icon toggles favorite state for each team in the browser
- Multiple teams can be favorited in a single session on the Add Teams screen
- "Done" button returns user to the home screen with updated favorites
- Favorites persist across page reloads
- Goes to Add teams screen when no teams are favorited

## Open questions

- Should the team dashboard have any initial content, or is a placeholder sufficient for this phase? A: Placeholder.
- Will additional organizations beyond Nepean Wildcats be added in the future?
- Should there be a way to unfavorite a team directly from the home screen, or only from the Add Teams browser? A: Home Screen also
- Is there a preferred ordering for teams on the home screen (alphabetical, by age, by level)? A: Age then Level from BB to AA

## Testing Guidelines

Create a test file(s) in the ./tests folder for the new feature, and create meaningful tests for the following cases, without going too heavy:

- Favorited teams render as horizontal cards on the home screen
- Tapping "Add Teams" navigates to the team browser
- All 6 team variants are listed in the team browser
- Heart toggle adds/removes a team from favorites
- "Done" button returns to the home screen with updated favorites
- Empty state displays when no teams are favorited
- Favorites persist after page reload

## Planning instructions

Save the plan to /.claude/plans/ and give it the same name as the source .md spec file that was input just change the ".md" to "-plan.md"

## Final output to the user

After the file is saved, respond to the user with the name of the file.

Do not repeat the full spec in the chat output unless the user explicitly asks to see it. The main goal is to save the plan file and report where it lives and what branch name to use.
