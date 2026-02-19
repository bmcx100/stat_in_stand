# Spec for Supabase Admin Backend

branch: claude/feature/supabase-admin-backend

## Summary

- Migrate the app from client-side localStorage to a Supabase-hosted backend
- Public viewers visit shareable team URLs (no login required) to see standings, schedule, scores, brackets
- Admins log in via an `/admin` route on the site to manage their assigned teams' data
- Two roles: super admin (creates teams, assigns admins) and team admin (manages their team only)
- Team registry moves from hardcoded `lib/teams.ts` to the database, allowing new teams over time
- Admin UI is redesigned with flatter navigation, simpler import flow, and less nesting
- Existing computation logic (parsers, standings, playdowns, tournaments) is reused as-is
- No need to migrate existing localStorage data — structure matters, data can be re-entered

## Functional Requirements

### Authentication

- Email + password login built into the site at `/admin` (not Supabase dashboard)
- First user (owner) is manually set as super admin in the database
- Super admin can invite team admins by email address from the `/admin` UI
- Each admin gets their own email + password credentials
- Admins are assigned to specific teams and can only edit those teams
- Auth sessions managed via Supabase Auth + SSR helpers

### Roles

- **Super admin**: Can create teams, assign/remove team admins, manage any team's data
- **Team admin**: Can manage data only for teams they are assigned to (games, standings, opponents, playdowns, tournaments)

### Public Viewer Experience

- No login required to view any team data
- Each team has a shareable URL: `/team/[slug]` (e.g., `/team/nw-u15-a`)
- Landing page at `/` shows a browsable list of all teams
- All current viewer pages are available: dashboard, schedule, results, standings (with mode dropdown), playdowns, tournaments, events archive
- Viewers bookmark or get sent a direct link — no account needed

### Admin Experience

- `/admin` shows a login form; after login, shows admin dashboard
- Admin dashboard lists the teams the logged-in user can manage
- Each team admin hub (`/admin/team/[slug]`) has flat navigation to:
  - **Games** — Import (OWHA/MHR/TeamSnap paste) and edit/manage games
  - **Standings** — Import standings and preview current data
  - **Opponents** — Manage opponent registry for this team
  - **Events** — Create and manage playdowns and tournaments
- Admin UI is redesigned: flatter (no nested tabs), cleaner import flow, less clutter
- Super admin has an additional `/admin/teams` page for creating teams and managing admin assignments

### Data Layer

- All data stored in Supabase PostgreSQL
- Tables: `teams`, `team_admins`, `opponents`, `games`, `standings`, `playdowns`, `tournaments`
- Opponents are scoped per team (not global)
- Standings, playdowns, and tournaments store config/rows as JSONB (matching current type shapes)
- Games are stored as individual rows (normalized)
- Row Level Security: public `SELECT` on all tables, write operations restricted to authenticated admins with matching team assignment

### Supabase Schema

**`teams`**: id (uuid), slug (unique text), organization, name, age_group, level, banner_url, created_at

**`team_admins`**: id (uuid), team_id (FK), user_id (FK → auth.users), role ("super_admin" | "team_admin"), created_at

**`opponents`**: id (uuid), team_id (FK), full_name, location, name, age_group, level, owha_id, created_at

**`games`**: id (uuid), team_id (FK), date, time, opponent_id (FK nullable), opponent_name, location, team_score, opponent_score, result, game_type, source, source_game_id, played, created_at

**`standings`**: id (uuid), team_id (FK unique), source_url, rows (jsonb), updated_at

**`playdowns`**: id (uuid), team_id (FK unique), config (jsonb), games (jsonb), updated_at

**`tournaments`**: id (uuid), team_id (FK), tournament_id, config (jsonb), games (jsonb), updated_at

### Route Structure

Public (no auth):

- `/` — Team list
- `/team/[slug]` — Dashboard
- `/team/[slug]/schedule` — Upcoming games
- `/team/[slug]/standings` — Standings with mode dropdown
- `/team/[slug]/results` — All games with filtering
- `/team/[slug]/playdowns` — Playdown bracket/standings
- `/team/[slug]/tournaments/[id]` — Tournament view
- `/team/[slug]/events` — Past events

Admin (auth required):

- `/admin` — Login + dashboard
- `/admin/teams` — Super admin: create teams, assign admins
- `/admin/team/[slug]` — Team admin hub
- `/admin/team/[slug]/games` — Import/edit games
- `/admin/team/[slug]/standings` — Import/manage standings
- `/admin/team/[slug]/opponents` — Manage opponents
- `/admin/team/[slug]/events` — Manage playdowns + tournaments

### Reusable Code

- `lib/parsers.ts` — All import parsers (OWHA, MHR, TeamSnap) work on raw text, no changes needed
- `lib/playdowns.ts` — Playdown standings computation, tiebreakers, qualification logic
- `lib/tournaments.ts` — Tournament pool standings, qualification, elimination round logic
- `lib/season.ts` — Season date inference

### New Dependencies

- `@supabase/supabase-js`
- `@supabase/ssr`

## Possible edge cases

- Admin tries to access a team they're not assigned to — redirect to admin dashboard with error
- Super admin removes themselves from a team — should still have access via super admin role
- Two admins editing the same team simultaneously — last write wins (acceptable for this scale)
- Team with no games/standings/playdowns — public pages show appropriate empty states (already handled)
- Supabase connection failure — show error state, don't crash
- Admin invites an email that already has an account — link existing account to team
- Slug conflicts when creating teams — validate uniqueness before insert

## Acceptance Criteria

- Public viewers can visit `/team/[slug]` and see all team data without logging in
- Landing page at `/` lists all teams
- Admin login works at `/admin` with email + password
- Super admin can create teams and invite team admins
- Team admins can only see and manage their assigned teams
- All current viewer functionality works (dashboard, schedule, results, standings dropdown, playdowns, tournaments)
- Admin can import games via paste (OWHA/MHR/TeamSnap), edit games, manage standings, opponents, playdowns, and tournaments
- Data persists in Supabase (not localStorage)
- RLS prevents unauthorized writes
- `npm run build` passes with no errors

## Open questions

- Should the landing page show all teams publicly, or only teams that have been "published" by an admin? published is best so setup can happen behind the scenes and then team published.
- Should there be a way for viewers to "favorite" teams without logging in (cookie/localStorage preference)? Yes, that should work like it does now with user's individual favourites.
- What hosting platform for the Next.js app itself (Vercel, etc.)? Yes it is already hosted on Vercel.
- Should the admin be able to upload banner images, or keep using static files? Yes, upload banner images.

## Testing Guidelines

No test framework is configured — skip automated tests for now. Manual verification:

- Visit public URLs without auth — confirm data loads
- Login as super admin — create team, assign admin
- Login as team admin — confirm restricted to assigned teams
- Import games via paste — confirm they appear on public page
- Edit/delete game — confirm changes reflect publicly

## Planning instructions

Save the plan to /.claude/plans/8_supabase-admin-backend-plan.md

## Final output to the user

After the file is saved, respond to the user with the name of the file AND STOP. DO NOT MAKE ANY CHANGES OR IMPLEMENT THE PLAN.

THE GOAL IS TO WRITE A DETAILED PLAN TO FILE NOT MAKE ANY CODE CHANGES. WRITE A SINGLE FILE AND STOP. DO NOT DO ANYTHING ELSE.
