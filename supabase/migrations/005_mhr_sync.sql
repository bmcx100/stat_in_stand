-- MHR (MyHockeyRankings) config + rankings tables
-- MHR config is stored in a separate table (not columns on teams)
-- because PostgREST schema cache does not reliably pick up ALTER TABLE ADD COLUMN.

create table if not exists mhr_config (
  team_id uuid primary key references teams(id) on delete cascade,
  team_nbr integer,
  div_nbr integer,
  div_age text,
  last_synced_at timestamptz,
  rankings_last_synced_at timestamptz
);

alter table mhr_config enable row level security;

create policy "Public read mhr_config" on mhr_config
  for select using (true);

create policy "Team admin write mhr_config" on mhr_config
  for all using (
    exists (
      select 1 from team_admins ta
      where ta.user_id = auth.uid()
      and (ta.role = 'super_admin' or ta.team_id = mhr_config.team_id)
    )
  );

create table if not exists mhr_rankings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  div_nbr integer not null,
  week integer not null,
  rows jsonb not null,
  synced_at timestamptz not null default now(),
  unique (team_id, week)
);

alter table mhr_rankings enable row level security;

create policy "Public read mhr_rankings" on mhr_rankings
  for select using (true);

create policy "Team admin write mhr_rankings" on mhr_rankings
  for all using (
    exists (
      select 1 from team_admins ta
      where ta.user_id = auth.uid()
      and (ta.role = 'super_admin' or ta.team_id = mhr_rankings.team_id)
    )
  );
