# Spec for Qualification Tracker

branch: claude/feature/qualification-tracker

## Summary

- Add a visual qualification tracker to the Playdowns "Graphs" tab
- Shows at a glance which teams are mathematically locked into provincials, which are eliminated, and which are still alive
- Three sections: Status Counter strip, Current Standings with progress bars, and a Qualification Line visualization
- All calculations are derived from existing playdown standings data (points, games remaining, qualifying spots)

## Functional Requirements

### Status Counter (Top Strip)

- Horizontal bar divided into three color-coded segments: OUT (red), ALIVE (amber), LOCKED (green)
- Each segment displays the count of teams in that state
- Status calculation for each team:
  - Let P = current points, R = games remaining, Max = P + (2 x R)
  - LOCKED: at least (N - K) other teams have their Max < this team's P
  - OUT: at least K other teams have P_i > this team's Max
  - ALIVE: all other cases
  - Where N = total teams, K = qualifying spots from PlaydownConfig

### Current Standings Section

- Vertical list of teams ordered by current points (descending)
- Each row displays:
  - Team name
  - Current record (W-L-T)
  - Current points (P)
  - Maximum possible points (Max)
  - Horizontal progress bar: full width = Max, filled portion = P
  - Status badge: OUT / ALIVE / LOCKED
- Progress bar color matches status: red (OUT), amber (ALIVE), green (LOCKED)
- The user's own team row (teamId "self") should be visually highlighted

### Qualification Line

- Horizontal number line from 0 to the theoretical maximum points in the format
- Each team represented by a numbered circle positioned at its current P value
- Circles are color-coded by status (OUT / ALIVE / LOCKED)
- Tapping a circle reveals a tooltip with: team name, games remaining (R), maximum possible points (Max)
- A vertical dashed marker shows the cutoff line at the K-th position team's current points
- The line is visually divided: left side labeled "Outside", right side labeled "Qualifying Zone"

### Data Source

- All data comes from existing PlaydownConfig and PlaydownGame arrays via computePlaydownStandings
- Games remaining (R) is calculated per team: (gamesPerMatchup x number of opponents) - GP, or derived from total expected games minus games played
- No new data storage or hooks required

## Possible edge cases

- All teams tied on points (cutoff line sits on a cluster of circles)
- A team with 0 games played (Max is fully theoretical)
- Only 1 qualifying spot or all but 1 qualify
- No games played yet (all teams at 0 points, all ALIVE)
- All games completed (every team is either LOCKED or OUT, no ALIVE)
- Teams with identical points on the qualification line (circles may overlap, need offset or stacking)

## Acceptance Criteria

- Graphs tab in Playdowns page renders all three sections when playdown data exists
- Status counts (OUT + ALIVE + LOCKED) always equal total teams
- LOCKED status only appears when mathematically guaranteed
- OUT status only appears when mathematically eliminated
- Progress bars accurately reflect P / Max ratio
- Qualification line positions teams proportionally along the scale
- Tapping a team circle on the qualification line shows tooltip info
- Own team is visually distinguished in standings section
- Works correctly with the existing playdown data format (no schema changes)

## Open questions

- Should the qualification line be scrollable horizontally on mobile if teams are spread far apart?
- Should there be an animation when status changes (e.g., a team clinches)?
- How to calculate games remaining per team when using imported standings with synthetic games (no explicit schedule)?

## Testing Guidelines

Create a test file(s) in the ./tests folder for the new feature, and create meaningful tests for the following cases, without going too heavy:

- Status calculation logic: verify LOCKED/OUT/ALIVE for known scenarios
- Edge case: all teams tied at 0 points, all should be ALIVE
- Edge case: season complete, verify no team is ALIVE
- Cutoff line position matches K-th team's points

## Planning instructions

Save the plan to /.claude/plans/ and give it the same name as the source .md spec file that was input just change the ".md" to "-plan.md"

## Final output to the user

After the file is saved, respond to the user with the name of the file.

Do not repeat the full spec in the chat output unless the user explicitly asks to see it. The main goal is to save the plan file and report where it lives and what branch name to use.
