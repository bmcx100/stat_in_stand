# Implementation Plan: Supabase Admin Backend

**Spec:** `.claude/specs/8_supabase-admin-backend.md`
**Branch:** `claude/feature/supabase-admin-backend`

## Context

The app is a fully client-side localStorage hockey team tracker. We're migrating to Supabase so one admin can manage team data online and everyone else can view it via public URLs. This plan covers the full migration in 7 phases, ordered by dependency.

---

## Phase 1: Supabase Project Setup

### Step 1.1: Create Supabase project
- Create a new Supabase project via the Supabase dashboard
- Note the project URL and anon key

### Step 1.2: Install dependencies
- `npm install @supabase/supabase-js @supabase/ssr`

### Step 1.3: Environment variables
- Create `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Add `.env.local` to `.gitignore` (verify it's not already tracked)
- Create `.env.example` with placeholder values for documentation

### Step 1.4: Create Supabase client utilities
- **Create `lib/supabase/client.ts`** — Browser client using `createBrowserClient()` from `@supabase/ssr`
- **Create `lib/supabase/server.ts`** — Server client using `createServerClient()` from `@supabase/ssr` with cookie handling for Next.js App Router

### Step 1.5: Database migrations
- **Create `supabase/migrations/001_schema.sql`** with all tables:

**`teams`** table:
- `id` uuid PK default `gen_random_uuid()`
- `slug` text UNIQUE NOT NULL
- `organization` text NOT NULL
- `name` text NOT NULL
- `age_group` text NOT NULL
- `level` text NOT NULL
- `banner_url` text
- `published` boolean DEFAULT false
- `created_at` timestamptz DEFAULT now()

**`team_admins`** table:
- `id` uuid PK default `gen_random_uuid()`
- `team_id` uuid FK → teams ON DELETE CASCADE
- `user_id` uuid FK → auth.users ON DELETE CASCADE
- `role` text NOT NULL CHECK (role IN ('super_admin', 'team_admin'))
- `created_at` timestamptz DEFAULT now()
- UNIQUE(team_id, user_id)

**`opponents`** table:
- `id` uuid PK default `gen_random_uuid()`
- `team_id` uuid FK → teams ON DELETE CASCADE
- `full_name` text NOT NULL
- `location` text DEFAULT ''
- `name` text DEFAULT ''
- `age_group` text DEFAULT ''
- `level` text DEFAULT ''
- `owha_id` text
- `created_at` timestamptz DEFAULT now()

**`games`** table:
- `id` uuid PK default `gen_random_uuid()`
- `team_id` uuid FK → teams ON DELETE CASCADE
- `date` date NOT NULL
- `time` text DEFAULT ''
- `opponent_id` uuid FK → opponents ON DELETE SET NULL
- `opponent_name` text NOT NULL
- `location` text DEFAULT ''
- `team_score` integer
- `opponent_score` integer
- `result` text CHECK (result IN ('W', 'L', 'T'))
- `game_type` text NOT NULL DEFAULT 'regular'
- `source` text NOT NULL DEFAULT 'manual'
- `source_game_id` text DEFAULT ''
- `played` boolean NOT NULL DEFAULT false
- `created_at` timestamptz DEFAULT now()

**`standings`** table:
- `id` uuid PK default `gen_random_uuid()`
- `team_id` uuid FK → teams ON DELETE CASCADE UNIQUE
- `source_url` text DEFAULT ''
- `rows` jsonb NOT NULL DEFAULT '[]'
- `updated_at` timestamptz DEFAULT now()

**`playdowns`** table:
- `id` uuid PK default `gen_random_uuid()`
- `team_id` uuid FK → teams ON DELETE CASCADE UNIQUE
- `config` jsonb NOT NULL
- `games` jsonb NOT NULL DEFAULT '[]'
- `updated_at` timestamptz DEFAULT now()

**`tournaments`** table:
- `id` uuid PK default `gen_random_uuid()`
- `team_id` uuid FK → teams ON DELETE CASCADE
- `tournament_id` text NOT NULL
- `config` jsonb NOT NULL
- `games` jsonb NOT NULL DEFAULT '[]'
- `updated_at` timestamptz DEFAULT now()
- UNIQUE(team_id, tournament_id)

### Step 1.6: Row Level Security
- **Create `supabase/migrations/002_rls.sql`**:
- Enable RLS on all tables
- All tables: `SELECT` policy for `anon` and `authenticated` roles (public read)
- `games`, `opponents`, `standings`, `playdowns`, `tournaments`: `INSERT`/`UPDATE`/`DELETE` policies checking that the authenticated user has a row in `team_admins` for the matching `team_id`
- `teams`: `INSERT`/`UPDATE` restricted to users with `super_admin` role in `team_admins`
- `team_admins`: `SELECT` for authenticated users (own rows), `INSERT`/`UPDATE`/`DELETE` for super_admin only

### Step 1.7: Supabase Storage (for banner images)
- Create a `banners` storage bucket in Supabase
- Public read access, authenticated write access
- Admin uploads banner → gets public URL → stored in `teams.banner_url`

### Verification
- Run migrations via Supabase dashboard SQL editor
- Confirm tables exist and RLS is enabled
- `npm run build` passes (no code changes yet, just new files)

---

## Phase 2: Auth + Middleware

### Step 2.1: Next.js middleware for auth
- **Create `middleware.ts`** at project root
- Refresh Supabase auth session on every request (required by `@supabase/ssr`)
- Protect `/admin/*` routes: if no session, redirect to `/admin` login page
- Allow `/admin` itself (the login page) without auth

### Step 2.2: Admin login page
- **Create `app/admin/page.tsx`**
- If not logged in: show email + password form
- On submit: call `supabase.auth.signInWithPassword()`
- On success: redirect to `/admin/dashboard`
- On error: show error message
- If already logged in: redirect to `/admin/dashboard`

### Step 2.3: Admin dashboard
- **Create `app/admin/dashboard/page.tsx`**
- Fetch user's teams from `team_admins` joined with `teams`
- If super_admin: show link to `/admin/teams` for team management
- List teams the user can manage, each linking to `/admin/team/[slug]`
- Add logout button (calls `supabase.auth.signOut()`)

### Step 2.4: Admin layout
- **Create `app/admin/layout.tsx`**
- Shared layout for admin pages: header with app name, user info, logout
- Pass auth context down

### Step 2.5: Create first super admin
- Manually create a user in Supabase Auth dashboard (email + password)
- Manually insert a row in `team_admins` with `role = 'super_admin'` and a null or placeholder `team_id`
- OR: create a one-time seed script

### Verification
- Visit `/admin` — see login form
- Login with super admin credentials — see dashboard
- Visit `/admin/dashboard` without auth — redirected to login
- Logout works

---

## Phase 3: Super Admin — Team & Admin Management

### Step 3.1: Team management page
- **Create `app/admin/teams/page.tsx`**
- Only accessible by super_admin role (check in page or middleware)
- List all teams with published/unpublished status
- "Create Team" form: organization, name, age_group, level, slug (auto-generated from name)
- Edit team: update fields, toggle published status
- Delete team (with confirmation)
- Banner upload: file input → upload to Supabase Storage `banners` bucket → save URL to `teams.banner_url`

### Step 3.2: Admin assignment
- On the team management page or per-team:
- "Invite Admin" form: enter email address, select team(s)
- If email exists in auth.users: create `team_admins` row
- If email doesn't exist: use `supabase.auth.admin.inviteUserByEmail()` (requires service role key — handle via API route)
- **Create `app/api/invite-admin/route.ts`** — server-side API route using service role key to invite users
- List current admins per team with ability to remove

### Verification
- Login as super admin → create a team → verify it appears in the database
- Toggle published → verify only published teams appear on public landing page
- Invite a team admin by email → verify they receive invite / can login
- Remove admin → verify they lose access

---

## Phase 4: Data Layer — Supabase Hooks

Replace all localStorage hooks with Supabase-backed equivalents. Each new hook fetches data from Supabase and provides mutation functions that write to Supabase.

### Step 4.1: Query utility
- **Create `lib/supabase/queries.ts`** — typed query functions for each table
- `fetchTeams()` — all published teams (public) or all teams (admin)
- `fetchTeamBySlug(slug)` — single team lookup
- `fetchGames(teamId)` — all games for a team
- `fetchStandings(teamId)` — standings for a team
- `fetchOpponents(teamId)` — opponents for a team
- `fetchPlaydown(teamId)` — playdown for a team
- `fetchTournaments(teamId)` — tournaments for a team
- Mutation functions: `insertGames()`, `updateGame()`, `deleteGame()`, `upsertStandings()`, etc.

### Step 4.2: New hooks
- **Create `hooks/use-supabase-teams.ts`** — replaces hardcoded `lib/teams.ts`
  - `useTeams()` — fetch all published teams
  - `useTeam(slug)` — fetch single team by slug
- **Create `hooks/use-supabase-games.ts`** — replaces `hooks/use-games.ts`
  - `useGames(teamId)` — fetch games, return `{ games, addGame, addGames, updateGame, removeGame, loading }`
- **Create `hooks/use-supabase-standings.ts`** — replaces `hooks/use-standings.ts`
  - `useStandings(teamId)` — fetch standings, return `{ standings, setStandings, loading }`
- **Create `hooks/use-supabase-opponents.ts`** — replaces `hooks/use-opponents.ts`
  - `useOpponents(teamId)` — fetch opponents, return `{ opponents, addOpponents, updateOpponent, removeOpponent, loading }`
- **Create `hooks/use-supabase-playdowns.ts`** — replaces `hooks/use-playdowns.ts`
  - `usePlaydowns(teamId)` — fetch playdown, return `{ playdown, setConfig, addGame, updateGame, removeGame, loading }`
- **Create `hooks/use-supabase-tournaments.ts`** — replaces `hooks/use-tournaments.ts`
  - `useTournaments(teamId)` — fetch tournaments, return `{ tournaments, addTournament, updateConfig, addGame, updateGame, removeGame, loading }`

### Step 4.3: Hook pattern
- Use `useState` + `useEffect` for data fetching (keep it simple, no extra dependencies)
- Mutations call Supabase directly and update local state optimistically
- Each hook takes `teamId` (uuid) not slug — resolve slug → id at the page level
- Add `loading` and `error` states for UI feedback

### Step 4.4: Favorites
- **Create `hooks/use-favorites.ts`** (keep as localStorage — viewer preference, no account needed)
- Same as current implementation, but store team slugs instead of hardcoded IDs

### Verification
- Import new hooks in a test page, verify data fetches correctly
- Verify mutations persist to Supabase
- `npm run build` passes

---

## Phase 5: Public Routes

Move current viewer pages from `/dashboard/[teamId]/*` to `/team/[slug]/*`, replacing localStorage hooks with Supabase hooks.

### Step 5.1: Landing page
- **Modify `app/page.tsx`** — fetch published teams from Supabase, display team cards
- Each card links to `/team/[slug]`
- Keep favorites functionality (localStorage)

### Step 5.2: Team layout
- **Create `app/team/[slug]/layout.tsx`** — based on current `app/dashboard/[teamId]/layout.tsx`
- Resolve slug → team data via `useTeam(slug)` hook
- Banner, bottom nav (Home, Schedule, Standings — no Admin button)
- Pass team data to children via context or props

### Step 5.3: Migrate viewer pages
For each page, copy from `app/dashboard/[teamId]/` to `app/team/[slug]/`, replacing:
- `useGames()` → `useGames(team.id)` (Supabase hook)
- `useStandings()` → `useStandings(team.id)` (Supabase hook)
- `useOpponents()` → `useOpponents(team.id)` (Supabase hook)
- `usePlaydowns()` → `usePlaydowns(team.id)` (Supabase hook)
- `useTournaments()` → `useTournaments(team.id)` (Supabase hook)
- Remove any write operations from viewer pages

Pages to migrate:
- **`app/team/[slug]/page.tsx`** — Dashboard (history cards, schedule preview, events)
- **`app/team/[slug]/schedule/page.tsx`** — Upcoming games
- **`app/team/[slug]/results/page.tsx`** — All games with filtering
- **`app/team/[slug]/standings/page.tsx`** — Standings with Regular Season / Playdowns dropdown (current `regular-season/page.tsx`)
- **`app/team/[slug]/playdowns/page.tsx`** — Playdown bracket/standings
- **`app/team/[slug]/tournaments/[id]/page.tsx`** — Tournament view
- **`app/team/[slug]/events/page.tsx`** — Past events archive

### Step 5.4: Loading states
- Add loading skeletons or spinners for each page while data fetches from Supabase
- Show "Team not found" if slug doesn't match a published team

### Verification
- Visit `/` — see published teams
- Visit `/team/[slug]` — see dashboard with Supabase data
- All subpages load correctly
- No write operations visible on public pages
- Unpublished teams return 404 or "not found" on public routes

---

## Phase 6: Admin Pages (Redesigned)

### Step 6.1: Team admin hub
- **Create `app/admin/team/[slug]/page.tsx`**
- Verify logged-in user has access to this team (from `team_admins`)
- Flat navigation links: Games, Standings, Opponents, Events
- Show team overview (name, record summary)

### Step 6.2: Team admin layout
- **Create `app/admin/team/[slug]/layout.tsx`**
- Sidebar or top nav: Games | Standings | Opponents | Events
- Back link to admin dashboard

### Step 6.3: Games management
- **Create `app/admin/team/[slug]/games/page.tsx`**
- **Top section**: Import area
  - Source selector (OWHA / MHR / TeamSnap) — radio or dropdown, not nested tabs
  - Single large textarea for paste
  - Parse button → show preview of parsed games with duplicate detection
  - Confirm button → insert to Supabase via `addGames()`
  - Reuse: `parseOwhaGames()`, `parseMhrGames()`, `parseTeamsnapGames()`, `findDuplicates()`, `matchOpponent()` from `lib/parsers.ts`
- **Bottom section**: Game list
  - All games for team, sorted by date desc
  - Inline edit: click game → expand to edit score, result, gameType, opponent, location
  - Delete button per game
  - Filter by gameType dropdown
  - Manual "Add Game" form (date, opponent, time, location, gameType)

### Step 6.4: Standings management
- **Create `app/admin/team/[slug]/standings/page.tsx`**
- Textarea to paste OWHA standings
- Source URL input field
- Parse button → preview table
- Save button → upsert to `standings` table
- Current standings displayed below for reference
- Reuse: `parseOwhaStandings()` from `lib/parsers.ts`

### Step 6.5: Opponents management
- **Create `app/admin/team/[slug]/opponents/page.tsx`**
- **Import section**: Paste OWHA team list → parse → preview → save
  - Reuse: `parseOwhaTeamList()` from `lib/parsers.ts`
- **List section**: All opponents with inline edit (name, location, age_group, level)
- Delete button per opponent
- Manual "Add Opponent" form

### Step 6.6: Events management (Playdowns + Tournaments)
- **Create `app/admin/team/[slug]/events/page.tsx`**
- Two sections: Playdowns and Tournaments (flat, not tabbed)
- **Playdowns section**:
  - Config form: total teams, qualifying spots, games per matchup
  - Team list management (add/remove teams, set names)
  - Game list: add games (home/away team selection, date, time, location), edit scores, delete
  - Current standings preview (using `computePlaydownStandings()` from `lib/playdowns.ts`)
- **Tournaments section**:
  - List existing tournaments with edit/delete
  - "New Tournament" form: name, location, dates, pools, teams, tiebreaker order
  - Per-tournament: game management (pool round, elimination round)
  - Current standings preview (using `computePoolStandings()` from `lib/tournaments.ts`)

### Verification
- Login as team admin → navigate to team admin hub
- Import games via paste → verify they appear on public page
- Edit a game score → verify change reflected publicly
- Import standings → verify public standings page updates
- Create a playdown → verify public playdowns page shows it
- Create a tournament → verify public tournament page shows it

---

## Phase 7: Cleanup

### Step 7.1: Remove old files
- Delete `hooks/use-games.ts` (replaced by `use-supabase-games.ts`)
- Delete `hooks/use-standings.ts` (replaced by `use-supabase-standings.ts`)
- Delete `hooks/use-opponents.ts` (replaced by `use-supabase-opponents.ts`)
- Delete `hooks/use-playdowns.ts` (replaced by `use-supabase-playdowns.ts`)
- Delete `hooks/use-tournaments.ts` (replaced by `use-supabase-tournaments.ts`)
- Delete `hooks/use-favorites.ts` (if replaced, or keep if still localStorage-based)
- Delete `lib/teams.ts` (hardcoded teams replaced by database)
- Delete `lib/backup.ts` (Supabase is source of truth)
- Delete `app/dashboard/` directory (replaced by `/team/[slug]/*` and `/admin/team/[slug]/*`)
- Delete `app/add-teams/` if it exists and is no longer needed

### Step 7.2: Update CLAUDE.md
- Update architecture section to reflect Supabase backend
- Update data layer table (hooks → Supabase tables)
- Add Supabase setup instructions
- Update route structure
- Add environment variable requirements

### Step 7.3: Rename Supabase hooks
- Optionally rename `use-supabase-*.ts` back to `use-*.ts` once old hooks are deleted (cleaner imports)

### Verification
- `npm run build` passes with no errors
- `npm run lint` passes
- No references to deleted files remain
- All public and admin pages work end-to-end

---

## Files Summary

### New files to create
```
.env.local                                    (env vars — gitignored)
.env.example                                  (template for env vars)
supabase/migrations/001_schema.sql            (database tables)
supabase/migrations/002_rls.sql               (row level security policies)
middleware.ts                                  (Next.js auth middleware)
lib/supabase/client.ts                        (browser Supabase client)
lib/supabase/server.ts                        (server Supabase client)
lib/supabase/queries.ts                       (typed CRUD functions)
hooks/use-supabase-teams.ts                   (teams from DB)
hooks/use-supabase-games.ts                   (games from DB)
hooks/use-supabase-standings.ts               (standings from DB)
hooks/use-supabase-opponents.ts               (opponents from DB)
hooks/use-supabase-playdowns.ts               (playdowns from DB)
hooks/use-supabase-tournaments.ts             (tournaments from DB)
app/admin/page.tsx                            (login page)
app/admin/layout.tsx                          (admin layout)
app/admin/dashboard/page.tsx                  (admin home)
app/admin/teams/page.tsx                      (super admin: team mgmt)
app/admin/team/[slug]/layout.tsx              (team admin layout)
app/admin/team/[slug]/page.tsx                (team admin hub)
app/admin/team/[slug]/games/page.tsx          (game management)
app/admin/team/[slug]/standings/page.tsx      (standings management)
app/admin/team/[slug]/opponents/page.tsx      (opponent management)
app/admin/team/[slug]/events/page.tsx         (playdown/tournament mgmt)
app/api/invite-admin/route.ts                (server-side admin invite)
app/team/[slug]/layout.tsx                    (public team layout)
app/team/[slug]/page.tsx                      (public dashboard)
app/team/[slug]/schedule/page.tsx             (public schedule)
app/team/[slug]/standings/page.tsx            (public standings)
app/team/[slug]/results/page.tsx              (public results)
app/team/[slug]/playdowns/page.tsx            (public playdowns)
app/team/[slug]/tournaments/[id]/page.tsx     (public tournament)
app/team/[slug]/events/page.tsx               (public past events)
```

### Files to modify
```
app/page.tsx                                  (landing page → fetch from Supabase)
app/globals.css                               (admin page styles)
lib/types.ts                                  (minor DB compatibility tweaks)
.gitignore                                    (add .env.local if not present)
package.json                                  (new dependencies)
```

### Files to delete (Phase 7)
```
hooks/use-games.ts
hooks/use-standings.ts
hooks/use-opponents.ts
hooks/use-playdowns.ts
hooks/use-tournaments.ts
lib/teams.ts
lib/backup.ts
app/dashboard/                                (entire directory)
```

### Files kept as-is (reused)
```
lib/parsers.ts                                (all import parsers)
lib/playdowns.ts                              (standings computation)
lib/tournaments.ts                            (tournament computation)
lib/season.ts                                 (season date logic)
components/ui/*                               (shadcn components)
```

---

## Implementation Order

Execute phases sequentially: 1 → 2 → 3 → 4 → 5 → 6 → 7. Each phase should build and pass before moving to the next. Within each phase, steps are ordered by dependency.

**Critical path**: Phase 1 (setup) → Phase 2 (auth) → Phase 4 (hooks) → Phase 5 (public routes). Phases 3 and 6 (admin UI) can be built in parallel with public routes once hooks exist.
