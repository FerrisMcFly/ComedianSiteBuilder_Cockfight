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
-- Pro (not sold yet): ComicTable admins switch it on by hand. Pro and comics on a site get the Custom look.
alter table comics add column if not exists pro boolean not null default false;
do $$
begin
  -- the list of looks grew (custom): replace the old check if it's there
  if exists (select 1 from pg_constraint where conname = 'comics_coaster_check' and pg_get_constraintdef(oid) not like '%custom%') then
    alter table comics drop constraint comics_coaster_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comics_coaster_check') then
    alter table comics add constraint comics_coaster_check check (
      look in ('classic', 'night', 'redwood', 'mustard', 'spooky', 'holiday', 'custom')
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

/* ---------------- the address: comictable.com/<handle> ---------------- */
-- One rule for everyone: the handle is the comic's full name, lowercase, with dashes ("Lev Fer" → lev-fer).
-- Made automatically and never typed by hand. A second "Lev Fer" gets lev-fer-2. It stays put if the name
-- changes later, so shared links keep working. Old links that used a comic's id still work too.
alter table comics add column if not exists handle text;
create or replace function public.coaster_handle(p_name text, p_id text default null) returns text
language plpgsql stable security definer set search_path = public as $$
declare base text := left(public.comic_slug(p_name), 60); h text; n int := 1;
begin
  if base in ('login', 'dashboard', 'admin', 'press', 'join', 'brand', 'fonts', 'themes', 'embed', 'sdk', 'api', 'app',
              'about', 'pricing', 'help', 'privacy', 'terms', 'coaster', 'coasters', 'c', 'u', 'www', 'index') then base := base || '-comic'; end if;
  h := base;
  while exists (select 1 from comics where lower(handle) = h and id is distinct from p_id) loop n := n + 1; h := base || '-' || n; end loop;
  return h;
end $$;
do $$
declare r record;
begin
  for r in select id, name from comics where handle is null order by created_at, id loop
    update comics set handle = public.coaster_handle(r.name, r.id) where id = r.id;
  end loop;
end $$;
create unique index if not exists comics_handle on comics (lower(handle));
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comics_handle_check') then
    alter table comics add constraint comics_handle_check check (handle ~ '^[a-z0-9][a-z0-9-]{0,63}$');
  end if;
end $$;
create or replace function public.comic_handle_default() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.handle is null or new.handle = '' then new.handle := public.coaster_handle(new.name, new.id); end if;
  if tg_op = 'UPDATE' and new.handle is distinct from old.handle and auth.uid() is not null and not public.is_platform_owner() then
    raise exception 'Coaster addresses are set by ComicTable.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists comics_handle_default on comics;
create trigger comics_handle_default before insert or update of handle on comics for each row execute function public.comic_handle_default();

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
drop function if exists public.also_on_bill(text);
create or replace function public.also_on_bill(p_comic text)
returns table (show_id uuid, comic_id text, name text, photo_url text, handle text)
language sql stable security definer set search_path = public as $$
  select distinct s1.id, c2.id, c2.name, c2.photo_url, c2.handle
  from shows s1
  join comics c1 on c1.id = p_comic and c1.on_bills
  join shows s2 on s2.date = s1.date and s2.venue_id = s1.venue_id and s2.id <> s1.id
  join comics c2 on c2.on_bills and c2.id <> p_comic and (c2.id = s2.comic_id or c2.id = any (coalesce(s2.lineup, '{}')))
  where (s1.comic_id = p_comic or p_comic = any (coalesce(s1.lineup, '{}')))
    and s1.venue_id is not null and s1.date >= current_date
    and coalesce(s1.status, '') <> 'cancelled' and coalesce(s2.status, '') <> 'cancelled'
  union
  -- a show event with a lineup: everyone else in it
  select s1.id, c2.id, c2.name, c2.photo_url, c2.handle
  from shows s1
  join comics c1 on c1.id = p_comic and c1.on_bills
  join comics c2 on c2.on_bills and c2.id <> p_comic and c2.id = any (s1.lineup)
  where p_comic = any (coalesce(s1.lineup, '{}')) and s1.date >= current_date and coalesce(s1.status, '') <> 'cancelled';
$$;
grant execute on function public.also_on_bill(text) to anon, authenticated;

/* ---------------- who gets what ---------------- */
-- Free Coasters pick a preset look. A Custom look (their own colors) comes with a site or Pro.
-- Only ComicTable admins switch Pro on or off.
create or replace function public.coaster_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.pro is distinct from (case when tg_op = 'UPDATE' then old.pro else false end) and not public.is_platform_owner() then
    raise exception 'Only ComicTable admins can change Pro.' using errcode = '42501';
  end if;
  if new.look = 'custom' and (tg_op = 'INSERT' or old.look is distinct from 'custom' or new.coaster->'style' is distinct from old.coaster->'style')
     and not new.pro and not exists (select 1 from hosts where comic_id = new.id) then
    raise exception 'Custom looks come with a site on ComicTable.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists comics_coaster_guard on comics;
create trigger comics_coaster_guard before insert or update on comics for each row execute function public.coaster_guard();

/* ---------------- dates on a Coaster with no site ---------------- */
-- A comic's own date doesn't need a site: site_id can be empty when the date belongs to a comic.
-- A whole-show event (no comic) still belongs to a site. (The old 'cockfight' default goes: it was never right for new rows.)
alter table shows alter column site_id drop default;
alter table shows alter column site_id drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shows_has_owner') then
    alter table shows add constraint shows_has_owner check (site_id is not null or comic_id is not null);
  end if;
end $$;
-- Every upcoming date for one comic, including ones with no site. (Same as in 13_me.sql, so either can run last.)
create or replace function public.comic_shows(p_comic text)
returns setof jsonb language sql stable set search_path = public as $$
  select to_jsonb(s) || jsonb_build_object('site_name', st.name, 'event', s.comic_id is null)
  from shows s left join sites st on st.id = s.site_id
  where (s.comic_id = p_comic or p_comic = any (s.lineup)) and s.date >= current_date
  order by s.date, s.time;
$$;
grant execute on function public.comic_shows(text) to anon, authenticated;
