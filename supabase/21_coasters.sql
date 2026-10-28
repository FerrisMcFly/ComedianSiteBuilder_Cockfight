-- Coasters: every comic's card on ComicTable (the "comics" table is the Coaster).
-- Adds the Tape (their best current set), a look, the shared-bill switch, a photo just for one site,
-- and asking before putting a comic who has their own login on a site.
-- Their public page is comictable.com/<id>.
-- Run once in Supabase → SQL Editor, after 20_showcase.sql. Safe to run again.
-- The rules for these (who can see and answer requests, keeping sites in step) are in 99_rules.sql.

/* ---------------- the Coaster ---------------- */
alter table comics add column if not exists tape_url text;           -- a YouTube (or other) link to their best current set
alter table comics add column if not exists tape_title text;         -- "Live at the Comedy Cellar, 2026"
alter table comics add column if not exists look text not null default 'classic';
alter table comics add column if not exists on_bills boolean not null default true;  -- show "also on the bill" both ways
-- What the Coaster shows, and where: { "tape": "front" | "more" | "off", ... }. Anything not listed uses the default.
alter table comics add column if not exists coaster jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comics_coaster_check') then
    alter table comics add constraint comics_coaster_check check (
      look in ('classic', 'night', 'redwood', 'mustard', 'spooky', 'holiday')
      and (tape_url is null or (tape_url ~* '^https://' and char_length(tape_url) <= 500))
      and char_length(coalesce(tape_title, '')) <= 120
      and jsonb_typeof(coaster) = 'object' and length(coaster::text) <= 2000);
  end if;
  -- comictable.com/<id> is the Coaster page, so a comic's id can't be one of the site's own addresses
  if not exists (select 1 from pg_constraint where conname = 'comics_id_not_reserved') then
    alter table comics add constraint comics_id_not_reserved check (id not in
      ('login', 'dashboard', 'admin', 'press', 'join', 'brand', 'fonts', 'themes', 'embed', 'sdk', 'api', 'app',
       'about', 'pricing', 'help', 'privacy', 'terms', 'coaster', 'coasters', 'c', 'u', 'www', 'index')) not valid;
  end if;
end $$;

/* ---------------- a photo just for one site ---------------- */
alter table hosts add column if not exists own_photo boolean not null default false;

/* ---------------- asking before adding someone with their own login ---------------- */
create table if not exists coaster_requests (
  id uuid primary key default gen_random_uuid(),
  comic_id text not null references comics(id) on delete cascade,
  site_id text not null references sites(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create unique index if not exists coaster_requests_open on coaster_requests (comic_id, site_id) where status = 'pending';
create index if not exists coaster_requests_comic on coaster_requests (comic_id, status);
alter table coaster_requests enable row level security;
grant select, insert, delete on coaster_requests to authenticated;

/* ---------------- also on the bill ---------------- */
-- For each upcoming date of one comic: the other comics at the same club on the same night.
-- Both comics have to leave "on_bills" on. No tagging: it comes from dates they each added.
create or replace function public.also_on_bill(p_comic text)
returns table (show_id uuid, comic_id text, name text, photo_url text)
language sql stable security definer set search_path = public as $$
  select distinct s1.id, c2.id, c2.name, c2.photo_url
  from shows s1
  join comics c1 on c1.id = p_comic and c1.on_bills
  join shows s2 on s2.date = s1.date and s2.venue_id = s1.venue_id and s2.id <> s1.id
  join comics c2 on c2.on_bills and c2.id <> p_comic and (c2.id = s2.comic_id or c2.id = any (coalesce(s2.lineup, '{}')))
  where (s1.comic_id = p_comic or p_comic = any (coalesce(s1.lineup, '{}')))
    and s1.venue_id is not null and s1.date >= current_date
    and coalesce(s1.status, '') <> 'cancelled' and coalesce(s2.status, '') <> 'cancelled'
  union
  -- a show event with a lineup: everyone else in it
  select s1.id, c2.id, c2.name, c2.photo_url
  from shows s1
  join comics c1 on c1.id = p_comic and c1.on_bills
  join comics c2 on c2.on_bills and c2.id <> p_comic and c2.id = any (s1.lineup)
  where p_comic = any (coalesce(s1.lineup, '{}')) and s1.date >= current_date and coalesce(s1.status, '') <> 'cancelled';
$$;
grant execute on function public.also_on_bill(text) to anon, authenticated;
