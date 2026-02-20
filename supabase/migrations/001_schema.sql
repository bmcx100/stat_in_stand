-- ============================================
-- 001_schema.sql — Create all tables
-- ============================================

-- Teams
create table teams (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  organization text not null,
  name text not null,
  age_group text not null,
  level text not null,
  banner_url text,
  published boolean default false,
  created_at timestamptz default now()
);

-- Team Admins (join table: users ↔ teams)
create table team_admins (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'team_admin')),
  created_at timestamptz default now(),
  unique(team_id, user_id)
);

-- Opponents (scoped per team)
create table opponents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade not null,
  full_name text not null,
  location text default '',
  name text default '',
  age_group text default '',
  level text default '',
  owha_id text,
  created_at timestamptz default now()
);

-- Games
create table games (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade not null,
  date date not null,
  time text default '',
  opponent_id uuid references opponents(id) on delete set null,
  opponent_name text not null,
  location text default '',
  team_score integer,
  opponent_score integer,
  result text check (result in ('W', 'L', 'T')),
  game_type text not null default 'regular',
  source text not null default 'manual',
  source_game_id text default '',
  played boolean not null default false,
  created_at timestamptz default now()
);

-- Standings (one per team)
create table standings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade unique not null,
  source_url text default '',
  rows jsonb not null default '[]',
  updated_at timestamptz default now()
);

-- Playdowns (one per team)
create table playdowns (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade unique not null,
  config jsonb not null,
  games jsonb not null default '[]',
  updated_at timestamptz default now()
);

-- Tournaments (multiple per team)
create table tournaments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade not null,
  tournament_id text not null,
  config jsonb not null,
  games jsonb not null default '[]',
  updated_at timestamptz default now(),
  unique(team_id, tournament_id)
);
