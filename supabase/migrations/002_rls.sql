-- ============================================
-- 002_rls.sql — Row Level Security policies
-- ============================================

-- Enable RLS on all tables
alter table teams enable row level security;
alter table team_admins enable row level security;
alter table opponents enable row level security;
alter table games enable row level security;
alter table standings enable row level security;
alter table playdowns enable row level security;
alter table tournaments enable row level security;

-- ============================================
-- Public read access (anon + authenticated)
-- ============================================

create policy "Public read teams"
  on teams for select
  to anon, authenticated
  using (true);

create policy "Public read opponents"
  on opponents for select
  to anon, authenticated
  using (true);

create policy "Public read games"
  on games for select
  to anon, authenticated
  using (true);

create policy "Public read standings"
  on standings for select
  to anon, authenticated
  using (true);

create policy "Public read playdowns"
  on playdowns for select
  to anon, authenticated
  using (true);

create policy "Public read tournaments"
  on tournaments for select
  to anon, authenticated
  using (true);

-- ============================================
-- team_admins: authenticated users see own rows
-- ============================================

create policy "Admins read own rows"
  on team_admins for select
  to authenticated
  using (user_id = auth.uid());

-- ============================================
-- teams: only super_admin can insert/update
-- ============================================

create policy "Super admin insert teams"
  on teams for insert
  to authenticated
  with check (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and team_admins.role = 'super_admin'
    )
  );

create policy "Super admin update teams"
  on teams for update
  to authenticated
  using (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and team_admins.role = 'super_admin'
    )
  );

create policy "Super admin delete teams"
  on teams for delete
  to authenticated
  using (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and team_admins.role = 'super_admin'
    )
  );

-- ============================================
-- team_admins: only super_admin can manage
-- ============================================

create policy "Super admin insert team_admins"
  on team_admins for insert
  to authenticated
  with check (
    exists (
      select 1 from team_admins ta
      where ta.user_id = auth.uid()
        and ta.role = 'super_admin'
    )
  );

create policy "Super admin update team_admins"
  on team_admins for update
  to authenticated
  using (
    exists (
      select 1 from team_admins ta
      where ta.user_id = auth.uid()
        and ta.role = 'super_admin'
    )
  );

create policy "Super admin delete team_admins"
  on team_admins for delete
  to authenticated
  using (
    exists (
      select 1 from team_admins ta
      where ta.user_id = auth.uid()
        and ta.role = 'super_admin'
    )
  );

-- ============================================
-- Data tables: team admins can write their teams
-- ============================================

-- Opponents
create policy "Team admin insert opponents"
  on opponents for insert
  to authenticated
  with check (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and (team_admins.role = 'super_admin' or team_admins.team_id = opponents.team_id)
    )
  );

create policy "Team admin update opponents"
  on opponents for update
  to authenticated
  using (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and (team_admins.role = 'super_admin' or team_admins.team_id = opponents.team_id)
    )
  );

create policy "Team admin delete opponents"
  on opponents for delete
  to authenticated
  using (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and (team_admins.role = 'super_admin' or team_admins.team_id = opponents.team_id)
    )
  );

-- Games
create policy "Team admin insert games"
  on games for insert
  to authenticated
  with check (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and (team_admins.role = 'super_admin' or team_admins.team_id = games.team_id)
    )
  );

create policy "Team admin update games"
  on games for update
  to authenticated
  using (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and (team_admins.role = 'super_admin' or team_admins.team_id = games.team_id)
    )
  );

create policy "Team admin delete games"
  on games for delete
  to authenticated
  using (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and (team_admins.role = 'super_admin' or team_admins.team_id = games.team_id)
    )
  );

-- Standings
create policy "Team admin insert standings"
  on standings for insert
  to authenticated
  with check (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and (team_admins.role = 'super_admin' or team_admins.team_id = standings.team_id)
    )
  );

create policy "Team admin update standings"
  on standings for update
  to authenticated
  using (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and (team_admins.role = 'super_admin' or team_admins.team_id = standings.team_id)
    )
  );

create policy "Team admin delete standings"
  on standings for delete
  to authenticated
  using (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and (team_admins.role = 'super_admin' or team_admins.team_id = standings.team_id)
    )
  );

-- Playdowns
create policy "Team admin insert playdowns"
  on playdowns for insert
  to authenticated
  with check (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and (team_admins.role = 'super_admin' or team_admins.team_id = playdowns.team_id)
    )
  );

create policy "Team admin update playdowns"
  on playdowns for update
  to authenticated
  using (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and (team_admins.role = 'super_admin' or team_admins.team_id = playdowns.team_id)
    )
  );

create policy "Team admin delete playdowns"
  on playdowns for delete
  to authenticated
  using (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and (team_admins.role = 'super_admin' or team_admins.team_id = playdowns.team_id)
    )
  );

-- Tournaments
create policy "Team admin insert tournaments"
  on tournaments for insert
  to authenticated
  with check (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and (team_admins.role = 'super_admin' or team_admins.team_id = tournaments.team_id)
    )
  );

create policy "Team admin update tournaments"
  on tournaments for update
  to authenticated
  using (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and (team_admins.role = 'super_admin' or team_admins.team_id = tournaments.team_id)
    )
  );

create policy "Team admin delete tournaments"
  on tournaments for delete
  to authenticated
  using (
    exists (
      select 1 from team_admins
      where team_admins.user_id = auth.uid()
        and (team_admins.role = 'super_admin' or team_admins.team_id = tournaments.team_id)
    )
  );
