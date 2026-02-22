-- ============================================
-- 003_owha_sync.sql — OWHA automated score sync
-- ============================================

-- Partial unique index on games: prevents duplicate OWHA game imports per team
create unique index if not exists games_owha_source_unique
  on games(team_id, source_game_id)
  where source_game_id is not null and source_game_id != '';

-- teams: OWHA regular season URL + last sync timestamp
alter table teams
  add column if not exists owha_url_regular text,
  add column if not exists owha_last_synced_at timestamptz;

-- playdowns: OWHA event flag + URL + last sync timestamp
alter table playdowns
  add column if not exists owha_event boolean not null default false,
  add column if not exists owha_url text,
  add column if not exists owha_last_synced_at timestamptz;

-- tournaments: OWHA event flag + URL + last sync timestamp
alter table tournaments
  add column if not exists owha_event boolean not null default false,
  add column if not exists owha_url text,
  add column if not exists owha_last_synced_at timestamptz;
