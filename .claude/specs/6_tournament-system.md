# Spec for Tournament System

branch: claude/feature/tournament-system

## Summary

- Add a full Tournament feature mirroring the Playdowns architecture but adapted for multi-day tournament formats
- Tournaments have a name, location, date range (typically 2-4 days), pool play qualifying rounds feeding into single-elimination brackets
- Support multiple pools (e.g. Pool A, Pool B) that independently or jointly qualify teams into a shared elimination round
- Optional consolation bracket for teams that don't qualify
- Tiebreaker rules are configurable per tournament (similar structure to playdowns but each tournament may differ)
- Games can be auto-imported from existing scheduled games (matched by date range and tournament name) or from data imports
- Tournament card appears on the dashboard with the same visibility rules as playdowns (1 month before to 1 week after)
- Admin section under Config > Events allows full tournament setup and management
- Drop down box to select existing tournaments or add new tournament button

## Functional Requirements

### Dashboard Integration

- A "Tournament" card appears on the team dashboard when the current date is within one month of the tournament start date
- Card shows tournament name and location and record if historical
- Clicking navigates to the dedicated Tournament page for that team
- After 1 week past the last game, the tournament moves to Past Events

### Tournament Page (Public-facing)

- Header shows tournament name, location, and date range
- Two main views via tabs: "Standings / Schedule" and "Graphs"
- Standings tab shows:
  - Pool standings tables (one per pool) with Team, GP, W, L, T, PTS, GF, GA, DIFF
  - Qualifying cutoff line per pool
  - Completed games with scores
  - Upcoming games with dates/times/locations
  - Elimination bracket showing matchups and results (single elimination tree)
  - Consolation bracket if configured
- Graphs tab shows:
  - Qualification tracker per pool (same visual as playdowns: status strip, progress bars, number line)
  - Combined view showing all pools feeding into elimination round

### Admin > Tournament Section

- Located under Config > Events (alongside Playdowns)
- Each tournament is a separate event entry with its own configuration

#### Setup / Configuration

- Tournament name (required)
- Tournament location (required)
- Start date and end date
- Number of pools (1-4)
- Teams per pool (assigned to specific pools)
- Number of teams per pool that qualify for elimination round
- Consolation bracket: yes/no
- Games per matchup within pool play (typically 1 for tournaments)
- Tiebreaker rules: ordered list that the admin can reorder or toggle on/off from a preset list:
  - Number of wins
  - Head-to-head record
  - Goal differential
  - Fewest goals allowed
  - Most periods won
  - Fewest penalty minutes
  - First goal scored
  - Coin flip / tournament director decision

#### Games Management

- Admin can manually add, edit, or remove games
- Each game entry: Date, Time, Home Team, Away Team, Home Score, Away Score, Location, Round (Pool Play / Quarterfinal / Semifinal / Final / Consolation)
- Auto-import: scan existing team schedule for games within the tournament date range that match the tournament name or opponent list, and offer to add them as tournament games
- Import from OWHA/MHR/TeamSnap data that falls within the tournament date range
- Scores entered in admin automatically update pool standings and bracket progression
- Elimination round games auto-populate based on pool finishing positions once pool play is complete

#### Elimination Bracket

- Single elimination tree generated from pool qualifying positions (e.g. Pool A #1 vs Pool B #2)
- Seeding/crossover rules configurable (which pool position plays which)
- Bracket updates as games are completed
- Consolation bracket follows same structure for non-qualifying teams if enabled

### Data Storage

- Tournament configuration, pools, games, and bracket stored in localStorage following the existing pattern (useSyncExternalStore + localStorage)
- New hook: `useTournaments()` with storage key `team-tournaments`
- Included in backup/restore functionality

## Possible edge cases

- Tournament with only 1 pool (effectively the same as playdowns but with elimination round)
- Tournament with uneven pools (e.g. Pool A has 4 teams, Pool B has 3)
- Pool play not yet complete but elimination bracket needs to show projected matchups
- Team withdraws mid-tournament — admin needs to mark games as forfeits
- Multiple tournaments in a season for the same team
- Tournament games that overlap with regular season games in the schedule
- All pool games tied with identical records — tiebreaker rules must resolve completely
- Consolation bracket with odd number of teams (byes needed)
- Auto-import finds games that could belong to the tournament but aren't certain — show confirmation UI
- Tournament spans a weekend with games on Friday-Sunday but not Saturday for some teams

## Acceptance Criteria

- Dashboard shows Tournament card within the visibility window (1 month before to 1 week after)
- Tournament page displays accurate pool standings calculated from game results
- Qualifying cutoff is clearly indicated per pool
- Elimination bracket renders correctly based on pool results
- Consolation bracket renders when configured
- Admin can configure all tournament criteria (name, location, pools, teams, tiebreakers, elimination seeding)
- Admin can enter and edit game scores for both pool play and elimination rounds
- Pool standings auto-update when scores change
- Bracket auto-advances when elimination game scores are entered
- Auto-import correctly identifies candidate games from the team schedule
- Graphs tab shows qualification tracker per pool
- Tiebreaker rules are configurable per tournament
- Tournament data is included in backup/restore
- Build passes with no TypeScript errors

## Open questions

- Should the elimination bracket seeding (crossover rules) be fully configurable or use a standard format (1A vs 2B, 1B vs 2A)?
- How should 3+ pools feed into a single elimination bracket (e.g. 3 pools with top 2 from each = 6 teams)?
- Should there be a "tournament director override" for manual bracket seeding?
- How to handle tie games in elimination rounds (overtime, shootout)? Just enter the final score?
- Should the auto-import match on tournament name field from the game data, or just date range + opponent list?
- Should each pool have its own tiebreaker rules or share the tournament-level rules?

## Testing Guidelines

Create a test file(s) in the ./tests folder for the new feature, and create meaningful tests for the following cases, without going too heavy:

- Pool standings calculation from game results (W/L/T, points, sorting)
- Qualifying cutoff correctly identifies top N teams per pool
- Elimination bracket generation from pool results (correct crossover seeding)
- Custom tiebreaker ordering produces correct standings
- Dashboard card visibility logic based on tournament dates
- Auto-import candidate matching by date range

## Planning instructions

Save the plan to /.claude/plans/ and give it the same name as the source .md spec file that was input just change the ".md" to "-plan.md"

## Final output to the user

After the file is saved, respond to the user with the name of the file.

Do not repeat the full spec in the chat output unless the user explicitly asks to see it. The main goal is to save the plan file and report where it lives and what branch name to use.
