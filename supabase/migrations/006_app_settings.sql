-- ============================================
-- 006_app_settings.sql — Global app settings
-- ============================================

create table app_settings (
  key   text primary key,
  value text not null
);

-- Seed default mode
insert into app_settings (key, value) values ('app_mode', 'playdowns');

-- RLS
alter table app_settings enable row level security;

-- Anyone can read settings (public site needs the mode)
create policy "Public read app_settings"
  on app_settings for select
  to anon, authenticated
  using (true);

-- Only the service role writes (admin API routes use service client)
-- No insert/update/delete policies for anon or authenticated roles
