-- comictable.com showcase: which site the front page's "See a site running on it" opens, and which sites
-- are listed under "Running on ComicTable". Set by super admins in the dashboard (All sites → On comictable.com).
-- Run once in Supabase → SQL Editor, after 19_more_socials.sql. Safe to run again.

create table if not exists platform_settings (
  id int primary key default 1 check (id = 1),               -- one row: ComicTable's own settings
  featured_site text references sites(id) on delete set null, -- "See a site running on it"
  showcase jsonb not null default '[]'::jsonb,                -- [{ "site": "cockfight", "blurb": "A comedy podcast." }], in order
  updated_at timestamptz not null default now()
);
insert into platform_settings (id) values (1) on conflict (id) do nothing;
-- start with Cockfight, the first site on ComicTable (only if nothing has been set yet)
update platform_settings set featured_site = 'cockfight', showcase = '[{"site": "cockfight", "blurb": "A comedy podcast."}]'::jsonb
where id = 1 and featured_site is null and showcase = '[]'::jsonb and exists (select 1 from sites where id = 'cockfight');

alter table platform_settings enable row level security;
drop policy if exists "public read" on platform_settings;
create policy "public read" on platform_settings for select using (true);
drop policy if exists "super admins write" on platform_settings;
create policy "super admins write" on platform_settings for all to authenticated
  using (exists (select 1 from platform_admins where user_id = auth.uid()))
  with check (exists (select 1 from platform_admins where user_id = auth.uid()));
grant select on platform_settings to anon, authenticated;
grant insert, update on platform_settings to authenticated;
