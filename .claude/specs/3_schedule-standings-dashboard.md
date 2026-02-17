# Spec for Schedule, Standings, and Dashboard

branch: claude/feature/schedule-standings-dashboard

## Summary

- Add schedule, game history, and standings data management to the app
- Support importing data from two sources: OWHA (standings + games) and My Hockey Rankings (game results)
- Merge all game data into a unified list with game type tagging
- Dashboard shows current record and links to schedule, game results, and standings
- Add the team banner card to the dashboard as a back-navigation element to My Teams
- Admin can import via paste or add games manually

## Data Sources

### Source 1: OWHA Standings

- **URL pattern:** `https://www.owha.on.ca/division/{divisionId}/{seasonId}/standings`
- **Columns:** Team Name + ID, GP, W, L, T, OTL, SOL, PTS, GF, GA, DIFF, PIM, Win%
- **Scope:** Regular season only
- **Store the source URL** per team so users can link out to the original

### Source 2: OWHA Games

- **URL pattern:** `https://www.owha.on.ca/division/{divisionId}/{seasonId}/games`
- **Columns:** Game #, Date/Time, Location, Home Team + ID (score), Visitor Team + ID (score)
- **Score logic:** If scores are absent (not 0-0), the game is scheduled/upcoming. 0-0 is a valid played result.
- **Scope:** Regular season (can be bulk-tagged on import)

### Source 3: My Hockey Rankings

- **URL:** `https://myhockeyrankings.com/association_rankings.php?y=2025&type=girls&state=ON`
- **Format:** Date, Time, Opponent (with age/level), Location (prefixed with "at"), Result (W/L/T), Score
- **Scope:** Mixed game types (regular season, tournaments, exhibition, etc.)
- **Notes:** Data is from the tracked team's perspective, no home/visitor distinction, no year in dates, may contain ad rows that need filtering

## Functional Requirements

- **Dashboard Enhancements**
  - Display the team's banner card at the top as a link back to `/` (My Teams)
  - Show the team's current record (W-L-T or similar) prominently
  - Provide links/navigation to: upcoming schedule, past game results, standings table
  - Gear icon linking to settings (in navbar)

- **Game Data Model**
  - All game and standings data is associated with a specific team ID from the app's team list (e.g., `nw-u13-a` for Nepean Wildcats U13 A)
  - The teamId is inherited automatically from the dashboard context — the admin is already viewing that team, so no selection is needed
  - Each game record should be source-agnostic (not dependent on home/visitor)
  - Fields: game ID, **teamId**, date, time, opponent, location, team score, opponent score, result (W/L/T), game type, source, played (boolean)
  - Game types: regular season, tournament, exhibition, playoffs, play downs, provincials
  - Games from both sources merge into a single unified list per team, deduplicated where possible

- **Standings Data Model**
  - All standings data is associated with a specific team ID
  - Per-team standings record: GP, W, L, T, OTL, SOL, PTS, GF, GA, DIFF, PIM, Win%
  - Division standings table includes all teams in the division (opponents), but is stored under the tracked team's ID
  - Source URL stored per team for linking out to OWHA and MHR

- **Data Import (Paste)**
  - Admin can paste OWHA standings data — app parses the column format
  - Admin can paste OWHA games data — app parses game #, date, location, teams, scores
  - Admin can paste My Hockey Rankings data — app parses date, opponent, location, result, score
  - OWHA imports default to "regular season" game type
  - My Hockey Rankings imports: admin can mark the batch as one type, or flag it as "mixed" and tag individual games afterward
  - Import should handle messy paste (ad rows, gaps in MHR data)

- **Manual Game Entry**
  - Form to add a single game: date, time, opponent, location, team score, opponent score, game type
  - Used for one-offs, corrections, or games not in either source

- **Schedule View**
  - List of upcoming games (no scores yet / played = false)
  - Sorted by date ascending

- **Game Results View**
  - List of past games with scores and W/L/T result
  - Sorted by date descending
  - Filterable by game type

- **Standings View**
  - Table showing division standings from imported OWHA data
  - Default table shows Team GP W L T PTS with an expandable details button that shows all info.
  - Link to original OWHA source URL

## Possible edge cases

- Duplicate games from OWHA and MHR imports — need deduplication logic (match by date + opponent)
- MHR data has no year — need to infer from season context
- MHR data has ad rows mixed in — parser needs to skip non-game rows
- OWHA team names include IDs (e.g., "Nepean Wildcats #2859") — need to parse/clean
- Game with 0-0 score vs game with no score (upcoming) — distinguish by presence of score data, not score value
- Admin imports data for wrong team — should validate or allow correction
- Standings data imported for a division the tracked team isn't in

## Acceptance Criteria

- Dashboard shows team banner card linking back to My Teams
- Dashboard displays current record (W-L-T)
- Dashboard has links to schedule, game results, and standings
- Admin can paste OWHA standings and it parses correctly
- Admin can paste OWHA games and it parses correctly
- Admin can paste MHR game data and it parses correctly
- Admin can tag game types on import (single type or mixed)
- Admin can manually add a game via form
- Games from both sources appear in a unified list
- Upcoming games appear in schedule view
- Past games appear in results view with scores
- Standings table displays with link to original OWHA source
- All data persists across page reloads

## Open questions

- How should deduplication work when the same game appears in OWHA and MHR data? A: when data is being imported there should be a summary of the status of the import and detailed view to show which games are an issue.
- Should the app store the raw OWHA team IDs (e.g., #2859) for future matching? A: yes
- What season/year context should be used to infer MHR dates that lack a year? A:Seasons run from August to July. We are only recording one season. So if current date is before end of year the games are Aug-Dec then they are in the current year and if current date is after Jan 1st those same games are in the previous year. Opposite for the games Jan-July.
- Should there be a way to edit or delete individual game records after import? A: yes
- How should the division standings URL be associated with a team — manual entry or auto-detected? A: manual and optional for any data import the link should be offered as a field.

## Testing Guidelines

Create a test file(s) in the ./tests folder for the new feature, and create meaningful tests for the following cases, without going too heavy:

- OWHA standings parser correctly extracts team records from pasted data
- OWHA games parser correctly extracts game details and distinguishes played vs upcoming
- MHR parser correctly extracts games and handles missing data/ad rows
- Game type tagging works for bulk and individual games
- Manual game entry adds a game to the unified list
- Dashboard displays current record accurately
- Schedule view shows only upcoming games
- Results view shows only played games
- Standings table renders with correct columns

## Planning instructions

Save the plan to /.claude/plans/ and give it the same name as the source .md spec file that was input just change the ".md" to "-plan.md"

## Final output to the user

After the file is saved, respond to the user with the name of the file.

Do not repeat the full spec in the chat output unless the user explicitly asks to see it. The main goal is to save the plan file and report where it lives and what branch name to use. DO NOT IMPLEMENT THE PLAN ONLY WRITE IT TO A FILE.
