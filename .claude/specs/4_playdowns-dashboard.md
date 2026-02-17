# Spec for Playdowns Dashboard

branch: claude/feature/playdowns-page

## Summary

- Add a dedicated Playdowns feature with its own page
- admin section should have a modes configuration section.
- Modes configuration should allow user to pick playdowns
- playdowns section needs a configuration setup, standings input, and game management
- A Playdowns card appears on the team dashboard when the start date is within one month
- The Playdowns page shows standings, description of setup (i.e. how many teams total and how many qualify), all playdown games, and results
- Admin can configure playdown criteria, manage standings, and enter/edit game scores
- Playdown standings track which teams qualify for Provincials

## Functional Requirements

### Dashboard Integration

- A "Playdowns" card appears on the team dashboard when the current date is within one month of the configured playdown start date
- If no playdown is configured or it's more than a month away, the button is hidden
- Clicking the card navigates to a dedicated Playdowns page for that team

### Playdowns Page (Public-facing)

- Shows a header/title indicating it's the Playdowns view
- Displays a standings table for all teams in the playdown group, showing: Team Name, GP, W, L, T, PTS (and any other relevant columns)
- Highlights which teams are in qualifying position for Provincials (e.g. top N teams)
- Highlights the user's tracked team in the standings
- Shows a list of all playdown games with dates, opponents, scores, and results
- Games are separated into completed (with scores/results) and upcoming sections

### Admin > Playdowns Section

- New tab or section within the existing Admin page
- admin section should have a modes configuration section.
- Modes configuration should allow user to pick playdowns
- playdowns section needs a configuration setup, standings input, and game management

#### Setup / Criteria

- Number of teams in the playdown group
- List of teams participating (import of standings or selectable from opponent registry or manually entered)
- Number of times each team plays every other team (e.g. home-and-home = 2)
- Number of teams that qualify for Provincials
- Playdown start date (used for the dashboard button visibility)
- Playdown end date (optional, for reference)

#### Standings

- Auto-calculated standings table based on entered game results
- Same columns as the public-facing standings: GP, W, L, T, PTS
- Points system should be configurable or use a sensible default (e.g. 2 pts for W, 1 for T, 0 for L)
- Qualifying teams visually indicated (e.g. line drawn after Nth place)

#### Games Management

- Admin can manually add, edit, or remove games
- Each game entry has: Date, Time, Home Team, Away Team, Home Score, Away Score, Location
- Admin can enter scores for completed games
- Standings update automatically when scores are entered
- Standings can also be updated via import

### Data Storage

- Playdown configuration, games, and standings stored in localStorage following the existing pattern (useSyncExternalStore + localStorage)
- Included in backup/restore functionality

## Possible edge cases

- No playdown configured yet — Admin section should show setup prompt, dashboard card stays hidden
- Playdown with only partial scores entered — standings should still calculate correctly from available data
- Team in the playdown group not in the opponent registry — allow manual entry
- Multiple playdown rounds in a season (unlikely but possible) — consider whether to support only one active playdown per team or multiple. Each team only has one playdown loop per season.
- Tie-breaking rules for standings are currently the following, If teams are tied in points at the conclusion of the round-robin series, the following criteria are used in numerical order to break the tie:

1. Number of wins.
2. Record against other tied teams.
3. Goals scored minus goals against in round-robin play.
4. Fewest goals allowed in round-robin play.
5. Most periods won in round-robin play.
6. Fewest penalty minutes in round-robin play.
7. First goal scored in the series.
8. Flip of a coin.
   If more than two teams are tied, these criteria are followed in order until all ties are broken.

- Admin changes the number of teams or matchups after games have been played — warn before regenerating schedule
- Playdown start date in the past — card should still show for 1 week past end date and then this card should be displayed in another page called 'Past Events' which should have a card just like the playdowns card that points to it.

## Acceptance Criteria

- Dashboard shows Playdowns card only when within one month of start date or during an active playdown or 1 week after end date
- Playdowns page displays accurate standings calculated from game results
- Qualifying position cutoff is clearly indicated in standings
- Admin can configure all playdown criteria (teams, matchups, qualifying spots, dates)
- Admin can enter and edit game scores
- Standings auto-update when scores change
- Playdown data is included in backup/restore
- Build passes with no TypeScript errors

## Open questions

- Should the points system be configurable per playdown, or use a fixed system (2-1-0)? Fixed
- Should there be support for overtime losses (OTL) in playdown standings? no
- When the schedule is auto-generated, should it attempt to space games out evenly, or just list all matchups for the admin to assign dates? No. The schedule is given. The admin and this app has no input on the dates games are played.
- Should the playdown card remain visible after all games are completed (as a historical view), or hide after the end date? Visible for a week and then visible in the Past Events section
- Are there scenarios where the tracked team is NOT in the playdown group but the admin still wants to track it? No.

## Testing Guidelines

Create a test file(s) in the ./tests folder for the new feature, and create meaningful tests for the following cases, without going too heavy:

- Standings calculation from a set of game results (W/L/T → points, GP, correct sorting)
- Qualifying cutoff correctly identifies top N teams
- Dashboard card visibility logic based on start date and current date

## Planning instructions

WHEN PLANNING THIS SPEC!!! - Save the results of the plan to /.claude/plans/ and give it the same name as the source .md spec file that was input just change the ".md" to "-plan.md". DO NOT IMPLEMENT ANYTHING SAVE NEW PLAN FILE!!!

## Final output to the user

After the file is saved, respond to the user with the name of the file.

Do not repeat the full plan in the chat output unless the user explicitly asks to see it. The main goal is to save the plan file and report where it lives and what name was used.
