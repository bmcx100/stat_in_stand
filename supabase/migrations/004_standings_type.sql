-- ============================================
-- 004_standings_type.sql
-- Add standings_type to support per-type standings (regular, playoffs, playdowns)
-- ============================================

-- Add the standings_type column (default 'regular' covers the existing row)
alter table standings add column standings_type text not null default 'regular';

-- Drop the old unique constraint on team_id alone
alter table standings drop constraint standings_team_id_key;

-- New composite unique: one row per team per standings type
alter table standings add constraint standings_team_id_type_key unique (team_id, standings_type);
