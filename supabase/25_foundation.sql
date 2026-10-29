-- The foundation (Oct 29): the Coaster is the comic, and sites pull from the Coasters on their lineup.
--   Coaster teams: a comic's own team (manager, agent, assistant), with the same roles as site teams.
--   ZIP codes: fans sign up with name, email and ZIP; "near a show" is 50 miles from their ZIP.
--   Fans live on Coasters: a site sign-up goes to the site's list and to every comic on its lineup.
--   Podcasts a comic is on stay on their Coaster, even after they leave the show (they can switch one off).
--   The same show added twice (by a comic and by a site) becomes one.
-- The rules (who can see and change what) are in 99_rules.sql with everything else.
-- Run once in Supabase → SQL Editor, after 24_safety.sql. Safe to run again.

/* ---------------- Coaster teams ---------------- */
-- The comic's own login is always theirs (comics.user_id). Their team: Owner (everything, including the team),
-- Editor (the Coaster, dates, links, look and fans) or Shows only (dates). Several people can share a role.
create table if not exists comic_team (
  comic_id text not null references comics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'shows')),
  created_at timestamptz not null default now(),
  primary key (comic_id, user_id)
);
create index if not exists comic_team_user on comic_team (user_id);
alter table comic_team enable row level security;
grant select on comic_team to authenticated;

/* ---------------- ZIP codes ---------------- */
-- Filled in by ComicTable's hourly job the first time it runs (about 42,000 US ZIP codes). Nothing to paste.
create table if not exists zips (
  zip text primary key check (zip ~ '^[0-9]{5}$'),
  lat double precision not null,
  lng double precision not null,
  city text,
  state text
);
alter table zips enable row level security;
drop policy if exists "public read" on zips;
create policy "public read" on zips for select using (true);
grant select on zips to anon, authenticated;

alter table fans add column if not exists name text;
alter table fans add column if not exists zip text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fans_name_len') then
    alter table fans add constraint fans_name_len check (name is null or char_length(name) <= 80);
  end if;
end $$;

/* ---------------- fans on Coasters ---------------- */
create table if not exists comic_fans (
  id uuid primary key default gen_random_uuid(),
  comic_id text not null references comics(id) on delete cascade,
  fan_id uuid references fans(id) on delete cascade,      -- the site sign-up it came from (empty: they joined on the Coaster)
  site_id text references sites(id) on delete set null,   -- where they signed up
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  name text check (name is null or char_length(name) <= 80),
  zip text,
  city text,
  state text,
  lat double precision,
  lng double precision,
  met_at text check (met_at is null or char_length(met_at) <= 200),
  source text not null default 'coaster',
  token uuid not null default gen_random_uuid() unique,   -- one-click "stop emailing me"
  created_at timestamptz not null default now()
);
create unique index if not exists comic_fans_email on comic_fans (comic_id, lower(email));
create index if not exists comic_fans_fan on comic_fans (fan_id);
alter table comic_fans enable row level security;
grant select, delete on comic_fans to authenticated;

/* ---------------- podcasts on Coasters ---------------- */
-- Every podcast a comic is on. Added when they're on a site's lineup and that site has the podcast;
-- kept after they leave. hidden: the comic switched it off on their Coaster.
create table if not exists comic_podcasts (
  comic_id text not null references comics(id) on delete cascade,
  site_id text not null references sites(id) on delete cascade,
  show_name text not null default '',
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (comic_id, site_id, show_name)
);
alter table comic_podcasts enable row level security;
drop policy if exists "public read" on comic_podcasts;
create policy "public read" on comic_podcasts for select using (true);
grant select on comic_podcasts to anon, authenticated;
grant update on comic_podcasts to authenticated;

/* ---------------- looks: Checker and Pop ---------------- */
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'comics_coaster_check' and pg_get_constraintdef(oid) not like '%checker%') then
    alter table comics drop constraint comics_coaster_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comics_coaster_check') then
    alter table comics add constraint comics_coaster_check check (
      look in ('classic', 'night', 'redwood', 'mustard', 'checker', 'pop', 'spooky', 'holiday', 'custom')
      and (tape_url is null or (tape_url ~* '^https://' and char_length(tape_url) <= 500))
      and char_length(coalesce(tape_title, '')) <= 120
      and jsonb_typeof(coaster) = 'object' and length(coaster::text) <= 4000);
  end if;
end $$;
