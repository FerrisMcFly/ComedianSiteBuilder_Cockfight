-- ComicTable v3: every database change since v2 (home screen, photo uploads, press kit, QR fan sign-up, more socials, comictable.com showcase, roles, Coasters, News, media, forum safety, the Coaster-first foundation) in one file. Paste it all into Supabase → SQL Editor and click Run.
-- Same as running 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 99 in order. Safe to run again, and safe if you already ran some of them.

-- ============================== 15_home_picks.sql ==============================
-- Home picks: what a comic wants visitors to see first on their site's home screen.
-- The comic picks them in the dashboard (Site extras → Home screen); the site's design decides how they look.
-- The first pick is the featured one. A pick made from a show drops off after that show's date.
-- Run once in Supabase → SQL Editor, after 14_blog.sql. Safe to run again.

create table if not exists home_picks (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references sites(id) on delete cascade,
  kind text not null default 'announcement'
    check (kind in ('show', 'video', 'announcement', 'merch', 'podcast', 'post', 'link')),
  headline text not null check (char_length(headline) between 1 and 90),
  body text check (char_length(body) <= 300),
  button_label text check (char_length(button_label) <= 30),
  link text check (char_length(link) <= 500),
  image_url text check (char_length(image_url) <= 500),
  -- when the pick came from a show, sold-out and cancelled carry over from it
  show_id uuid references shows(id) on delete cascade,
  -- shown until this date (inclusive); empty = until removed
  ends_on date,
  hidden boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists home_picks_site_idx on home_picks (site_id, sort);

alter table home_picks enable row level security;
drop policy if exists "public read" on home_picks;
create policy "public read" on home_picks for select using (not hidden or public.is_site_admin(site_id));
drop policy if exists "site admin write" on home_picks;
create policy "site admin write" on home_picks for all to authenticated
  using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id));
grant select on home_picks to anon, authenticated;
grant insert, update, delete on home_picks to authenticated;

-- ============================== 16_photo_uploads.sql ==============================
-- Photo uploads: anyone who can edit something on ComicTable can upload its pictures.
-- That's a site's team, ComicTable super admins, and comics with their own login (their profile photo).
-- Also lets them read back what they upload (the upload step needs it).
-- Run once in Supabase → SQL Editor, after 15_home_picks.sql. Safe to run again.

create or replace function public.can_upload_photos() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
      or exists (select 1 from platform_admins where user_id = auth.uid())
      or exists (select 1 from comics where user_id = auth.uid());
$$;
grant execute on function public.can_upload_photos() to authenticated;

drop policy if exists "admin upload photos" on storage.objects;
drop policy if exists "admin update photos" on storage.objects;
drop policy if exists "admin delete photos" on storage.objects;
drop policy if exists "editors read photos" on storage.objects;
create policy "admin upload photos" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.can_upload_photos());
create policy "admin update photos" on storage.objects for update to authenticated using (bucket_id = 'photos' and public.can_upload_photos());
create policy "admin delete photos" on storage.objects for delete to authenticated using (bucket_id = 'photos' and public.can_upload_photos());
create policy "editors read photos" on storage.objects for select to authenticated using (bucket_id = 'photos');

-- ============================== 17_press_kit.sql ==============================
-- Press kit: a comic's approved photos and bio, for clubs to download.
-- It belongs to the comic (like their dates), so it's the same on every site they're on.
-- Clubs see it at comictable.com/press/<comic id>, and on any comic site that has a Press page.
-- Run once in Supabase → SQL Editor, after 16_photo_uploads.sql. Safe to run again.

/* ---------------- bios and contact ---------------- */
alter table comics add column if not exists short_bio text;          -- ~50 words, for club listings
alter table comics add column if not exists long_bio text;           -- for programs and press
alter table comics add column if not exists credits text;            -- one per line: "Comedy Central", "JFL New Faces 2025"
alter table comics add column if not exists booking_contact text;    -- an email or a name and email
alter table comics drop constraint if exists comics_press_lengths;
alter table comics add constraint comics_press_lengths check (
  char_length(coalesce(short_bio, '')) <= 600 and char_length(coalesce(long_bio, '')) <= 5000
  and char_length(coalesce(credits, '')) <= 2000 and char_length(coalesce(booking_contact, '')) <= 300);

/* ---------------- photos ---------------- */
create table if not exists press_photos (
  id uuid primary key default gen_random_uuid(),
  comic_id text not null references comics(id) on delete cascade,
  url text not null check (char_length(url) <= 500),           -- the full-size original, for download
  web_url text check (char_length(web_url) <= 500),             -- a smaller copy for showing on pages
  credit text check (char_length(credit) <= 120),               -- "Photo: Jane Smith"
  orientation text check (orientation in ('portrait', 'landscape', 'square')),
  width int, height int,
  is_primary boolean not null default false,                     -- "if you only use one, use this"
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists press_photos_comic_idx on press_photos (comic_id, sort);
create unique index if not exists press_photos_one_primary on press_photos (comic_id) where is_primary;

alter table press_photos enable row level security;
drop policy if exists "public read" on press_photos;
create policy "public read" on press_photos for select using (true);
drop policy if exists "comic editors" on press_photos;
create policy "comic editors" on press_photos for all to authenticated
  using (public.can_edit_comic(comic_id)) with check (public.can_edit_comic(comic_id));
grant select on press_photos to anon, authenticated;
grant insert, update, delete on press_photos to authenticated;

/* ---------------- storage: full-size files, one folder per comic ---------------- */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('press', 'press', true, 26214400, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "press upload" on storage.objects;
drop policy if exists "press update" on storage.objects;
drop policy if exists "press delete" on storage.objects;
drop policy if exists "press read" on storage.objects;
create policy "press upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'press' and public.can_edit_comic((storage.foldername(name))[1]));
create policy "press update" on storage.objects for update to authenticated
  using (bucket_id = 'press' and public.can_edit_comic((storage.foldername(name))[1]));
create policy "press delete" on storage.objects for delete to authenticated
  using (bucket_id = 'press' and public.can_edit_comic((storage.foldername(name))[1]));
create policy "press read" on storage.objects for select to authenticated using (bucket_id = 'press');

-- ============================== 18_fan_signup.sql ==============================
-- Quick fan sign-up (the QR code page): fans can say where they met the comic, and the list
-- remembers how each fan joined (on the site, from a QR code, or from an embed).
-- Run once in Supabase → SQL Editor, after 17_press_kit.sql. Safe to run again.

alter table fans add column if not exists met_at text;
alter table fans add column if not exists source text not null default 'site';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fans_met_at_len') then
    alter table fans add constraint fans_met_at_len check (met_at is null or char_length(met_at) <= 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fans_source_kind') then
    alter table fans add constraint fans_source_kind check (source in ('site', 'qr', 'embed'));
  end if;
end $$;

-- Same as before, plus two optional answers. Existing sites keep calling it with four.
drop function if exists public.join_fans(text, text, bigint, int);
create or replace function public.join_fans(p_site text, p_email text, p_place bigint, p_radius int default 50, p_met text default null, p_source text default 'site')
returns text language plpgsql security definer set search_path = public as $$
declare p record; e text := lower(trim(p_email)); existed boolean;
  m text := nullif(left(trim(coalesce(p_met, '')), 200), '');
  src text := case when p_source in ('site', 'qr', 'embed') then p_source else 'site' end;
begin
  if not exists (select 1 from sites where id = p_site and coalesce((features->>'fans')::boolean, false)) then
    raise exception 'This site isn''t taking sign-ups right now.' using errcode = 'P0001';
  end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 200 then
    raise exception 'That email doesn''t look right.' using errcode = 'P0001';
  end if;
  select * into p from places where id = p_place;
  if not found then raise exception 'Pick your city from the list.' using errcode = 'P0001'; end if;
  existed := exists (select 1 from fans where site_id = p_site and lower(email) = e);
  insert into fans (site_id, email, place_id, city, state, lat, lng, radius_mi, met_at, source)
    values (p_site, e, p.id, p.name, p.state, p.lat, p.lng, case when p_radius in (25, 50, 100, 250) then p_radius else 50 end, m, src)
  on conflict (site_id, lower(email)) do update set place_id = excluded.place_id, city = excluded.city, state = excluded.state,
    lat = excluded.lat, lng = excluded.lng, radius_mi = excluded.radius_mi,
    met_at = coalesce(excluded.met_at, fans.met_at);  -- signing up again never wipes where you met
  return case when existed then 'updated' else 'joined' end;
end $$;
revoke all on function public.join_fans(text, text, bigint, int, text, text) from public;
grant execute on function public.join_fans(text, text, bigint, int, text, text) to anon, authenticated;

-- ============================== 19_more_socials.sql ==============================
-- More social links: Threads, Bluesky, Facebook, Twitch, Kick, Snapchat, Spotify, Apple Podcasts,
-- SoundCloud, Substack and Cameo, on top of Instagram, YouTube, TikTok, X and website.
-- Like the others they belong to the comic and show on every site they're on.
-- Stored as one JSON object ({ "threads": "https://…", … }) so adding a platform later needs no database change.
-- Run once in Supabase → SQL Editor, after 18_fan_signup.sql. Safe to run again.

alter table comics add column if not exists socials jsonb not null default '{}'::jsonb;
alter table hosts add column if not exists socials jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comics_socials_size') then
    alter table comics add constraint comics_socials_size check (jsonb_typeof(socials) = 'object' and length(socials::text) <= 4000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hosts_socials_size') then
    alter table hosts add constraint hosts_socials_size check (jsonb_typeof(socials) = 'object' and length(socials::text) <= 4000);
  end if;
end $$;

-- Same two sync functions as 11_comics.sql, now copying the new links too.
create or replace function public.comic_to_hosts() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update hosts set name = new.name, status = new.status, photo_url = new.photo_url, instagram = new.instagram, youtube = new.youtube,
    tiktok = new.tiktok, twitter = new.twitter, website = new.website, socials = coalesce(new.socials, '{}'::jsonb),
    bio = case when own_bio then bio else new.bio end, title = case when own_title then title else new.title end
  where comic_id = new.id;
  return new;
end $$;

create or replace function public.host_from_comic() returns trigger language plpgsql set search_path = public as $$
declare c record;
begin
  if new.comic_id is null then return new; end if;
  select * into c from comics where id = new.comic_id;
  if not found then return new; end if;
  new.name := c.name; new.status := c.status; new.photo_url := c.photo_url; new.instagram := c.instagram; new.youtube := c.youtube;
  new.tiktok := c.tiktok; new.twitter := c.twitter; new.website := c.website; new.socials := coalesce(c.socials, '{}'::jsonb);
  if not new.own_bio then new.bio := c.bio; end if;
  if not new.own_title then new.title := c.title; end if;
  return new;
end $$;

-- ============================== 20_showcase.sql ==============================
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

-- ============================== 21_coasters.sql ==============================
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

-- ============================== 22_news.sql ==============================
-- Home screen = News + Links.
-- News is one list of things a comic pins for now: a show, a video, a special, an announcement. Each shows as a
-- big card, a scrolling banner or a small strip, from a start date until an end date. Links stay their own list
-- (permanent buttons). This takes over from Announcements: every announcement moves into News as a banner,
-- once (re-running this is safe). The old announcements table stays until after the big ship; nothing edits it.
-- Run once in Supabase → SQL Editor, after 21_coasters.sql. Safe to run again.

alter table home_picks add column if not exists style text not null default 'card';
alter table home_picks add column if not exists starts_on date;
alter table home_picks add column if not exists from_announcement uuid;  -- the announcement it came from, if any
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'home_picks_style_check') then
    alter table home_picks add constraint home_picks_style_check check (style in ('card', 'banner', 'strip'));
  end if;
end $$;
create unique index if not exists home_picks_from_announcement on home_picks (from_announcement) where from_announcement is not null;

-- Announcements move into News as banners (pinned ones first), keeping their dates and links.
insert into home_picks (site_id, kind, style, headline, body, button_label, link, starts_on, ends_on, sort, from_announcement)
select a.site_id, 'announcement', 'banner',
  case when char_length(a.text) <= 90 then a.text else left(a.text, 89) || '…' end,
  case when char_length(a.text) > 90 then left(a.text, 300) end,
  left(nullif(a.link_label, ''), 30), left(nullif(a.link, ''), 500), a.starts_on, a.ends_on,
  case when a.pinned then -100 + coalesce(a.sort, 0) else 100 + coalesce(a.sort, 0) end,
  a.id
from announcements a
where coalesce(trim(a.text), '') <> ''
  and not exists (select 1 from home_picks p where p.from_announcement = a.id);

-- ============================== 23_media.sql ==============================
-- Media and streaming: Spotify links for episodes, which videos are YouTube Shorts, and going live.
-- Run once in Supabase → SQL Editor, after 22_news.sql. Safe to run again.

-- An episode's Spotify page. Filled in by the hourly import once Spotify keys are in Netlify
-- (SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET) and the site has its Spotify show link; or typed in.
alter table episodes add column if not exists spotify_url text;

-- YouTube Shorts: the import marks them from the channel's Shorts-only list, so sites can show them in their own strip.
alter table videos add column if not exists is_short boolean not null default false;

-- Live right now: { "url": "https://twitch.tv/…", "title": "…", "started_at": "…" }, or empty when not live.
-- The site's team sets it with "Go live" in the dashboard and clears it with "End". Sites stop showing LIVE
-- on their own after 12 hours, in case someone forgets to end it.
alter table sites add column if not exists live jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sites_live_check') then
    alter table sites add constraint sites_live_check check (live is null or (jsonb_typeof(live) = 'object' and length(live::text) <= 1000));
  end if;
end $$;

-- ============================== 24_safety.sql ==============================
-- Forum and chat safety: reports, held posts, and approved fans.
-- The rules themselves (what gets held, links, limits) are in 99_rules.sql with the rest of the posting rules.
-- Run once in Supabase → SQL Editor, after 23_media.sql. Safe to run again.

-- Approved fans: a moderator approved one of their posts. With "Links from: approved fans", only they can post links.
create table if not exists trusted (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references sites(id) on delete cascade,
  author text,
  device text,
  created_at timestamptz not null default now(),
  check (author is not null or device is not null)
);
create index if not exists trusted_site on trusted (site_id);

-- Reports: anyone can report a topic, reply or chat message. It's hidden until a moderator keeps or removes it.
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references sites(id) on delete cascade,
  kind text not null check (kind in ('thread', 'post', 'chat')),
  item_id text not null,
  reason text check (char_length(reason) <= 200),
  device text,
  status text not null default 'open' check (status in ('open', 'kept', 'removed')),
  created_at timestamptz not null default now()
);
create index if not exists reports_site_open on reports (site_id, status, created_at desc);

alter table trusted enable row level security;
alter table reports enable row level security;
grant insert on reports to anon, authenticated;
grant select, update, delete on reports to authenticated;
grant select, insert, delete on trusted to authenticated;

-- ============================== 25_foundation.sql ==============================
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

-- ============================== 26_customize.sql ==============================
-- Everything is free for now (founder, Oct 29): every comic gets every customization, Custom colors included.
-- Only ComicTable admins still switch Pro on or off (it unlocks nothing yet).
-- The Coaster's settings grew (the page around it, lettering, doodles, templates, the QR code), so it gets more room.
-- Run once in Supabase → SQL Editor, after 25_foundation.sql. Safe to run again.

create or replace function public.coaster_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.pro is distinct from (case when tg_op = 'UPDATE' then old.pro else false end) and not public.is_platform_owner() then
    raise exception 'Only ComicTable admins can change Pro.' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'comics_coaster_check' and pg_get_constraintdef(oid) like '%4000%') then
    alter table comics drop constraint comics_coaster_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comics_coaster_check') then
    alter table comics add constraint comics_coaster_check check (
      look in ('classic', 'night', 'redwood', 'mustard', 'checker', 'pop', 'spooky', 'holiday', 'custom')
      and (tape_url is null or (tape_url ~* '^https://' and char_length(tape_url) <= 500))
      and char_length(coalesce(tape_title, '')) <= 120
      and jsonb_typeof(coaster) = 'object' and length(coaster::text) <= 8000);
  end if;
end $$;

-- ============================== 99_rules.sql ==============================
-- ComicTable's access rules: every function and policy that decides who can do what, in one place.
-- This file always runs LAST (it's at the end of every UPGRADE bundle), so re-running an older upgrade
-- can never undo the current rules. Change a rule here, not in the numbered files. Safe to run again.
--
-- Roles
-- ComicTable staff (platform_admins):
--   admin: everything, including staff, creating sites, deleting comics and the comictable.com showcase
--   staff: works on every site and comic, but can't add or remove staff, create sites, delete comics,
--          change what comictable.com shows off, or manage a site's team
-- A site's team (admins):
--   owner: everything on the site, including the team
--   editor: everything but the team
--   shows: dates, ticket links, clubs and the show finder only
--   moderator: forum, chat, bans and the moderation log only

/* ---------------- the roles themselves ---------------- */
alter table platform_admins add column if not exists role text not null default 'admin';
alter table platform_admins drop constraint if exists platform_admins_role_check;
alter table platform_admins add constraint platform_admins_role_check check (role in ('admin', 'staff'));

alter table admins drop constraint if exists admins_role_check;
alter table admins add constraint admins_role_check check (role in ('owner', 'editor', 'shows', 'moderator'));

/* ---------------- who can do what ---------------- */
-- Full access to a site's content: its owners and editors, and all ComicTable staff.
create or replace function public.is_site_admin(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and site_id = sid and role in ('owner', 'editor'))
      or exists (select 1 from platform_admins where user_id = auth.uid());
$$;
-- One part of a site: full access, or the role made for that part.
create or replace function public.can_site(sid text, area text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_site_admin(sid)
      or exists (select 1 from admins where user_id = auth.uid() and site_id = sid
                 and ((area = 'shows' and role = 'shows') or (area = 'community' and role = 'moderator')));
$$;
grant execute on function public.can_site(text, text) to anon, authenticated;
-- ComicTable staff of any kind, and ComicTable admins only.
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;
create or replace function public.is_platform_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid() and role = 'admin');
$$;
grant execute on function public.is_platform_owner() to anon, authenticated;

-- A comic's Coaster (founder, Oct 29): the comic, their Coaster team (owners and editors), and ComicTable staff.
-- A site's team can't change a comic's Coaster unless they're on that comic's team too. The one exception is a
-- Coaster nobody has claimed yet (no login, no team): the owners and editors of a site they're on look after it.
-- (Written so it also works before 25_foundation.sql has made the teams table.)
create or replace function public.can_edit_comic(c text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ok boolean;
begin
  if exists (select 1 from platform_admins where user_id = auth.uid()) or exists (select 1 from comics where id = c and user_id = auth.uid()) then return true; end if;
  if to_regclass('public.comic_team') is not null then
    execute 'select exists (select 1 from comic_team where comic_id = $1 and user_id = auth.uid() and role in (''owner'', ''editor''))' into ok using c;
    if ok then return true; end if;
    execute 'select exists (select 1 from comic_team where comic_id = $1)' into ok using c;
    if ok then return false; end if;
  end if;
  return not exists (select 1 from comics where id = c and user_id is not null)
     and exists (select 1 from hosts h join admins a on a.site_id = h.site_id and a.user_id = auth.uid() and a.role in ('owner', 'editor') where h.comic_id = c);
end $$;
grant execute on function public.can_edit_comic(text) to anon, authenticated;
-- Who manages a Coaster's team: the comic, their team's owners, and ComicTable staff.
create or replace function public.can_manage_comic_team(c text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  if exists (select 1 from platform_admins where user_id = auth.uid()) or exists (select 1 from comics where id = c and user_id = auth.uid()) then return true; end if;
  if to_regclass('public.comic_team') is not null then
    execute 'select exists (select 1 from comic_team where comic_id = $1 and user_id = auth.uid() and role = ''owner'')' into ok using c;
  end if;
  return ok;
end $$;
grant execute on function public.can_manage_comic_team(text) to anon, authenticated;
-- A comic's dates: the same people, their team's "Shows only" people, and the owners, editors and "Shows only"
-- people of any site they're on (sites add their comics' dates).
create or replace function public.can_edit_comic_dates(c text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  if public.can_edit_comic(c) then return true; end if;
  if to_regclass('public.comic_team') is not null then
    execute 'select exists (select 1 from comic_team where comic_id = $1 and user_id = auth.uid())' into ok using c;
    if ok then return true; end if;
  end if;
  return exists (select 1 from hosts h join admins a on a.site_id = h.site_id and a.user_id = auth.uid() and a.role in ('owner', 'editor', 'shows') where h.comic_id = c);
end $$;
grant execute on function public.can_edit_comic_dates(text) to anon, authenticated;

/* ---------------- shows: owners, editors, staff, and "shows" people ---------------- */
drop policy if exists "site admin write" on shows;
create policy "site admin write" on shows for all to authenticated using (public.can_site(site_id, 'shows')) with check (public.can_site(site_id, 'shows'));
drop policy if exists "comic editors" on shows;
create policy "comic editors" on shows for all to authenticated
  using (comic_id is not null and public.can_edit_comic_dates(comic_id)) with check (comic_id is not null and public.can_edit_comic_dates(comic_id));
drop policy if exists "site admins" on found_shows;
create policy "site admins" on found_shows for all to authenticated using (public.can_site(site_id, 'shows')) with check (public.can_site(site_id, 'shows'));
drop policy if exists "comic editors" on found_shows;
create policy "comic editors" on found_shows for all to authenticated
  using (comic_id is not null and public.can_edit_comic_dates(comic_id)) with check (comic_id is not null and public.can_edit_comic_dates(comic_id));
-- the show finder's links (podcast and YouTube sources stay with owners and editors)
drop policy if exists "shows people manage show sources" on sources;
create policy "shows people manage show sources" on sources for all to authenticated
  using (kind = 'shows' and public.can_site(site_id, 'shows')) with check (kind = 'shows' and public.can_site(site_id, 'shows'));
-- hiding a date on one site
drop policy if exists "site admin manage" on site_hidden;
create policy "site admin manage" on site_hidden for all to authenticated
  using (public.is_site_admin(site_id) or (kind = 'show' and public.can_site(site_id, 'shows')))
  with check (public.is_site_admin(site_id) or (kind = 'show' and public.can_site(site_id, 'shows')));
-- clubs: shows people can add a new (unverified) club for their site and fix the ones they added, like owners and editors
drop policy if exists "site admins add venues" on venues;
drop policy if exists "read venues" on venues;
create policy "read venues" on venues for select using (
  status = 'approved' or public.can_site(created_by_site, 'shows') or public.is_platform_admin());
drop policy if exists "add venues" on venues;
create policy "add venues" on venues for insert to authenticated with check (
  public.is_platform_admin() or (verified = false and public.can_site(created_by_site, 'shows')));
drop policy if exists "edit venues" on venues;
create policy "edit venues" on venues for update to authenticated using (
  public.is_platform_admin() or (verified = false and public.can_site(created_by_site, 'shows')))
  with check (public.is_platform_admin() or (verified = false and public.can_site(created_by_site, 'shows')));

/* ---------------- forum and chat: owners, editors, staff, and moderators ---------------- */
do $$
declare t text;
begin
  foreach t in array array['threads', 'posts', 'bans', 'mod_log', 'chat_messages'] loop
    execute format('drop policy if exists "site admin manage" on %I', t);
    execute format('create policy "site admin manage" on %I for all to authenticated using (public.can_site(site_id, ''community'')) with check (public.can_site(site_id, ''community''))', t);
  end loop;
end $$;
drop policy if exists "public read" on chat_messages;
create policy "public read" on chat_messages for select using (not deleted or public.can_site(site_id, 'community'));

/* ---------------- photos: only into a site you can edit (or your own Coaster's sites) ---------------- */
-- Files live under "<site id>/…". Owners, editors and staff can add or change a site's photos.
-- A comic with their own login can add photos for the sites they're on (their profile photo).
create or replace function public.can_upload_photos(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_site_admin(folder)
      or public.can_edit_comic(folder)   -- a Coaster's own folder: "<comic id>/…"
      or exists (select 1 from hosts h join comics c on c.id = h.comic_id
                 where h.site_id = folder and c.user_id = auth.uid());
$$;
grant execute on function public.can_upload_photos(text) to authenticated;
drop policy if exists "admin upload photos" on storage.objects;
drop policy if exists "admin update photos" on storage.objects;
drop policy if exists "admin delete photos" on storage.objects;
drop function if exists public.can_upload_photos();  -- the older one from 16_photo_uploads.sql
create policy "admin upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_upload_photos((storage.foldername(name))[1]));
create policy "admin update photos" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.can_upload_photos((storage.foldername(name))[1]));
create policy "admin delete photos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.can_upload_photos((storage.foldername(name))[1]));

/* ---------------- comics: added by owners and editors (any site) or ComicTable staff ---------------- */
drop policy if exists "admins add" on comics;
create policy "admins add" on comics for insert to authenticated
  with check (exists (select 1 from admins where user_id = auth.uid() and role in ('owner', 'editor'))
           or exists (select 1 from platform_admins where user_id = auth.uid()));

/* ---------------- clubs: "Shows only" people can remove an unverified club their site added ---------------- */
drop policy if exists "remove venues" on venues;
create policy "remove venues" on venues for delete to authenticated using (
  public.is_platform_admin() or (verified = false and public.can_site(created_by_site, 'shows')));

/* ---------------- ComicTable admins only ---------------- */
create or replace function public.create_site(p_id text, p_name text, p_domain text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Only ComicTable admins can create sites.' using errcode = 'P0001';
  end if;
  if p_id !~ '^[a-z0-9][a-z0-9-]{1,40}$' then
    raise exception 'A site id uses lowercase letters, numbers and dashes, like "john-smith".' using errcode = 'P0001';
  end if;
  if exists (select 1 from sites where id = p_id) then
    raise exception 'There''s already a site called "%".', p_id using errcode = 'P0001';
  end if;
  insert into sites (id, name, domain, features)
    values (p_id, p_name, nullif(trim(coalesce(p_domain, '')), ''),
            '{"shows": true, "podcast": true, "videos": true, "merch": false, "forum": false, "chat": false}');
  insert into boards (site_id, id, name, description, sort) values
    (p_id, 'general', 'General', 'Talk about anything', 0),
    (p_id, 'shows', 'Live Shows', 'Going to a show? Saw one? Post here', 1),
    (p_id, 'episodes', 'Episodes', 'Talk about the latest episodes', 2);
end $$;

drop function if exists public.platform_admin_list();
create or replace function public.platform_admin_list()
returns table (user_id uuid, email text, role text, you boolean) language sql stable security definer set search_path = public as $$
  select p.user_id, u.email::text, p.role, p.user_id = auth.uid()
  from platform_admins p join auth.users u on u.id = p.user_id
  where exists (select 1 from platform_admins where user_id = auth.uid())
  order by p.role, u.email;
$$;
revoke all on function public.platform_admin_list() from public;
grant execute on function public.platform_admin_list() to authenticated;

create or replace function public.remove_platform_admin(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Only ComicTable admins can do that.' using errcode = 'P0001';
  end if;
  if p_user = auth.uid() then
    raise exception 'You can''t remove yourself.' using errcode = 'P0001';
  end if;
  delete from platform_admins where user_id = p_user;
end $$;

-- Change someone's ComicTable role. There's always at least one admin left.
create or replace function public.set_platform_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Only ComicTable admins can do that.' using errcode = 'P0001';
  end if;
  if p_role not in ('admin', 'staff') then
    raise exception 'Pick admin or staff.' using errcode = 'P0001';
  end if;
  if p_role = 'staff' and not exists (select 1 from platform_admins where role = 'admin' and user_id <> p_user) then
    raise exception 'ComicTable needs at least one admin.' using errcode = 'P0001';
  end if;
  update platform_admins set role = p_role where user_id = p_user;
end $$;
revoke all on function public.set_platform_role(uuid, text) from public;
grant execute on function public.set_platform_role(uuid, text) to authenticated;

drop policy if exists "super admins delete" on comics;
create policy "super admins delete" on comics for delete to authenticated using (public.is_platform_owner());
do $$ begin
  if to_regclass('public.platform_settings') is not null then
    execute 'drop policy if exists "super admins write" on platform_settings';
    execute 'create policy "super admins write" on platform_settings for all to authenticated using (public.is_platform_owner()) with check (public.is_platform_owner())';
  end if;
end $$;

/* ---------------- keeping every site in step with a comic's Coaster ---------------- */
-- A site's copy of a comic (hosts) follows the comic, except a bio, title or photo the site set for itself.
-- These lived in 11_comics and 19_more_socials; they're here so an older upgrade can't bring back an old copy.
alter table comics add column if not exists socials jsonb not null default '{}'::jsonb;
alter table hosts add column if not exists socials jsonb not null default '{}'::jsonb;
alter table hosts add column if not exists own_photo boolean not null default false;

create or replace function public.comic_to_hosts() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update hosts set name = new.name, status = new.status, instagram = new.instagram, youtube = new.youtube,
    tiktok = new.tiktok, twitter = new.twitter, website = new.website, socials = coalesce(new.socials, '{}'::jsonb),
    photo_url = case when own_photo then photo_url else new.photo_url end,
    bio = case when own_bio then bio else new.bio end, title = case when own_title then title else new.title end
  where comic_id = new.id;
  return new;
end $$;
drop trigger if exists comics_sync on comics;
create trigger comics_sync after update on comics for each row execute function public.comic_to_hosts();

create or replace function public.host_from_comic() returns trigger language plpgsql set search_path = public as $$
declare c record;
begin
  if new.comic_id is null then return new; end if;
  select * into c from comics where id = new.comic_id;
  if not found then return new; end if;
  new.name := c.name; new.status := c.status; new.instagram := c.instagram; new.youtube := c.youtube;
  new.tiktok := c.tiktok; new.twitter := c.twitter; new.website := c.website; new.socials := coalesce(c.socials, '{}'::jsonb);
  if not new.own_photo then new.photo_url := c.photo_url; end if;
  if not new.own_bio then new.bio := c.bio; end if;
  if not new.own_title then new.title := c.title; end if;
  return new;
end $$;
drop trigger if exists hosts_from_comic on hosts;
create trigger hosts_from_comic before insert or update of comic_id, own_bio, own_title, own_photo on hosts
  for each row execute function public.host_from_comic();

/* ---------------- putting a comic with their own login on a site ---------------- */
-- A comic who has claimed their Coaster (has a login) says yes before a site can add them.
-- No ask needed: the comic adding themselves, ComicTable admins, and the server (no login).
do $$ begin
  if to_regclass('public.coaster_requests') is not null then
    execute 'drop policy if exists "see requests" on coaster_requests';
    execute $p$create policy "see requests" on coaster_requests for select to authenticated using (
      requested_by = auth.uid() or public.is_site_admin(site_id) or public.is_platform_admin()
      or exists (select 1 from comics c where c.id = comic_id and c.user_id = auth.uid()))$p$;
    execute 'drop policy if exists "ask" on coaster_requests';
    execute $p$create policy "ask" on coaster_requests for insert to authenticated with check (
      requested_by = auth.uid() and status = 'pending' and public.is_site_admin(site_id))$p$;
    execute 'drop policy if exists "take back" on coaster_requests';
    execute $p$create policy "take back" on coaster_requests for delete to authenticated using (
      status = 'pending' and (requested_by = auth.uid() or public.is_site_admin(site_id)))$p$;
  end if;
end $$;

create or replace function public.host_needs_ok() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if new.comic_id is null or auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.comic_id is not distinct from old.comic_id then return new; end if;
  select user_id into owner from comics where id = new.comic_id;
  if owner is null or owner = auth.uid() or public.is_platform_owner() then return new; end if;
  if to_regclass('public.coaster_requests') is not null and exists (
       select 1 from coaster_requests where comic_id = new.comic_id and site_id = new.site_id and status = 'approved') then
    return new;
  end if;
  raise exception 'This comic has their own login. Ask them first: they''ll get a request to say yes.' using errcode = 'P0001';
end $$;
drop trigger if exists hosts_needs_ok on hosts;
create trigger hosts_needs_ok before insert or update of comic_id on hosts for each row execute function public.host_needs_ok();

-- The comic (or a ComicTable admin) answers. Yes puts them on the site, at the end of its lineup.
create or replace function public.answer_coaster_request(p_id uuid, p_yes boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r record; c record; hid text; n int := 0;
begin
  select * into r from coaster_requests where id = p_id and status = 'pending';
  if not found then raise exception 'That request was already answered.' using errcode = 'P0001'; end if;
  select * into c from comics where id = r.comic_id;
  if not (c.user_id = auth.uid() or public.is_platform_owner()) then
    raise exception 'Only the comic can answer this.' using errcode = '42501';
  end if;
  update coaster_requests set status = case when p_yes then 'approved' else 'declined' end, answered_at = now() where id = p_id;
  if p_yes and not exists (select 1 from hosts where site_id = r.site_id and comic_id = r.comic_id) then
    hid := r.site_id || '-' || coalesce(nullif(public.comic_slug(split_part(c.name, ' ', 1)), 'comic'), 'person');
    while exists (select 1 from hosts where id = hid) loop n := n + 1; hid := hid || '-' || n; end loop;
    insert into hosts (id, site_id, comic_id, name, sort)
      values (hid, r.site_id, r.comic_id, c.name, (select count(*) from hosts where site_id = r.site_id));
  end if;
end $$;
revoke all on function public.answer_coaster_request(uuid, boolean) from public;
grant execute on function public.answer_coaster_request(uuid, boolean) to authenticated;

/* ---------------- forum and chat safety ---------------- */
-- Every fan post (topic, reply, chat message) goes through community_guard. A site's community settings:
--   forum_open, chat_open, slow_mode_seconds (default 30), chat_slow_seconds (default 5), banned_words, reserve_names
--   links_from: "nobody" (default), "approved" (fans a moderator approved) or "everyone"
--   hold_first_posts: a fan's first post waits for a moderator (approving it approves the fan)
-- Plus a cap per fan: 20 forum posts and 60 chat messages an hour.
-- Held and reported posts are hidden from the public until a moderator keeps or removes them.
alter table threads add column if not exists held boolean not null default false;
alter table threads add column if not exists reviewed boolean not null default false;
alter table posts add column if not exists held boolean not null default false;
alter table posts add column if not exists reviewed boolean not null default false;
alter table chat_messages add column if not exists held boolean not null default false;
alter table chat_messages add column if not exists reviewed boolean not null default false;

-- Does a post have a link in it? (an address, or something.com)
create or replace function public.has_link(t text) returns boolean language sql immutable as $$
  select coalesce(t, '') ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|gg|ly|tv|co|me|xyz|app|link|info|biz|us|uk|ca|club|live|site|online|shop)(\M|/))';
$$;

-- A fan a moderator approved (by name or by device).
create or replace function public.is_trusted(p_site text, p_author text, p_device text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  if to_regclass('public.trusted') is null then return false; end if;
  execute 'select exists (select 1 from trusted where site_id = $1 and ((author is not null and lower(author) = lower($2)) or (device is not null and device = $3)))'
    into ok using p_site, p_author, p_device;
  return ok;
end $$;

create or replace function public.community_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c jsonb;
  admin_ok boolean := public.can_site(new.site_id, 'community');
  wait_s int;
  txt text;
  w text;
  b record;
  links text;
  recent int;
begin
  new.author := trim(new.author);
  if admin_ok then new.held := false; return new; end if;
  new.is_mod := false;            -- only the site's team gets the host badge
  new.held := false; new.reviewed := false;

  select community into c from sites where id = new.site_id;
  c := coalesce(c, '{}'::jsonb);

  if tg_table_name = 'chat_messages' then
    if coalesce((c->>'chat_open')::boolean, true) = false then raise exception 'The chat is closed right now.' using errcode = 'P0001'; end if;
    wait_s := coalesce((c->>'chat_slow_seconds')::int, 5);
    txt := new.body;
  else
    if coalesce((c->>'forum_open')::boolean, true) = false then raise exception 'The forum is closed for posting right now.' using errcode = 'P0001'; end if;
    wait_s := coalesce((c->>'slow_mode_seconds')::int, 30);
    if tg_table_name = 'threads' then
      if not exists (select 1 from boards where site_id = new.site_id and id = new.board and not hidden) then
        raise exception 'That board doesn''t exist.' using errcode = 'P0001'; end if;
      if exists (select 1 from boards where site_id = new.site_id and id = new.board and locked) then
        raise exception 'This board is locked. Only the hosts can post here.' using errcode = 'P0001'; end if;
      txt := new.title;
    else
      if exists (select 1 from threads where id = new.thread_id and locked) then
        raise exception 'This topic is locked.' using errcode = 'P0001'; end if;
      txt := new.body;
    end if;
  end if;

  -- bans (by name or by device)
  select * into b from bans
   where site_id = new.site_id and (until is null or until > now())
     and ((author is not null and lower(author) = lower(new.author)) or (device is not null and device = new.device))
   limit 1;
  if found then raise exception 'You''ve been banned from posting here.' using errcode = 'P0001'; end if;

  -- names that belong to the hosts
  if coalesce((c->>'reserve_names')::boolean, true) and (
       lower(new.author) in ('admin', 'administrator', 'mod', 'moderator', 'webmaster', 'host')
       or exists (select 1 from hosts h where h.site_id = new.site_id
                   and (lower(h.name) = lower(new.author) or lower(split_part(h.name, ' ', 1)) = lower(new.author)))) then
    raise exception 'That name is reserved. Pick a different username.' using errcode = 'P0001';
  end if;

  -- banned words (checked in the title too for new topics)
  for w in select jsonb_array_elements_text(coalesce(c->'banned_words', '[]'::jsonb)) loop
    if length(trim(w)) > 0 and position(lower(trim(w)) in lower(coalesce(txt, ''))) > 0 then
      raise exception 'Your post has a word this site doesn''t allow.' using errcode = 'P0001';
    end if;
  end loop;

  -- links: nobody (the default), approved fans only, or everyone
  links := coalesce(c->>'links_from', 'nobody');
  if links <> 'everyone' and public.has_link(txt) and not (links = 'approved' and public.is_trusted(new.site_id, new.author, new.device)) then
    raise exception '%', case when links = 'approved' then 'Links are only for approved fans here. Post it without the link.' else 'Links aren''t allowed here. Post it without the link.' end using errcode = 'P0001';
  end if;

  -- slow mode (per device, falling back to per name), then an hourly cap
  if tg_table_name = 'chat_messages' then
    if wait_s > 0 and exists (select 1 from chat_messages m where m.site_id = new.site_id
                 and ((new.device is not null and m.device = new.device) or lower(m.author) = lower(new.author))
                 and m.created_at > now() - make_interval(secs => wait_s)) then
      raise exception 'Slow down! Wait a few seconds between messages.' using errcode = 'P0001'; end if;
    select count(*) into recent from chat_messages m where m.site_id = new.site_id
      and ((new.device is not null and m.device = new.device) or lower(m.author) = lower(new.author)) and m.created_at > now() - interval '1 hour';
    if recent >= 60 then raise exception 'That''s a lot of messages. Take a breather and come back in a bit.' using errcode = 'P0001'; end if;
  elsif tg_table_name = 'posts' then
    if wait_s > 0 and exists (select 1 from posts p where p.site_id = new.site_id
                 and ((new.device is not null and p.device = new.device) or lower(p.author) = lower(new.author))
                 and p.created_at > (extract(epoch from now()) * 1000 - wait_s * 1000)) then
      raise exception 'Slow down! Wait a little before posting again.' using errcode = 'P0001'; end if;
    select count(*) into recent from posts p where p.site_id = new.site_id
      and ((new.device is not null and p.device = new.device) or lower(p.author) = lower(new.author)) and p.created_at > (extract(epoch from now()) * 1000 - 3600000);
    if recent >= 20 then raise exception 'That''s a lot of posts for one hour. Come back in a bit.' using errcode = 'P0001'; end if;
  end if;

  -- first posts wait for a moderator (when the site turned that on); a held topic holds its first post too
  if tg_table_name = 'posts' then
    if exists (select 1 from threads where id = new.thread_id and held) then new.held := true; return new; end if;
  end if;
  if coalesce((c->>'hold_first_posts')::boolean, false) and not public.is_trusted(new.site_id, new.author, new.device) then
    if tg_table_name = 'chat_messages' then
      new.held := not exists (select 1 from chat_messages m where m.site_id = new.site_id and not m.held and not m.deleted
                               and ((new.device is not null and m.device = new.device) or lower(m.author) = lower(new.author)));
    else
      new.held := not exists (select 1 from posts p where p.site_id = new.site_id and not p.held
                               and ((new.device is not null and p.device = new.device) or lower(p.author) = lower(new.author)));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists threads_guard on threads;
create trigger threads_guard before insert on threads for each row execute function public.community_guard();
drop trigger if exists posts_guard on posts;
create trigger posts_guard before insert on posts for each row execute function public.community_guard();
drop trigger if exists chat_guard on chat_messages;
create trigger chat_guard before insert on chat_messages for each row execute function public.community_guard();

-- The public sees what isn't held (held: waiting for approval, or reported and waiting for a moderator)
drop policy if exists "public read" on threads;
create policy "public read" on threads for select using (not held or public.can_site(site_id, 'community'));
drop policy if exists "public read" on posts;
create policy "public read" on posts for select using (not held or public.can_site(site_id, 'community'));
drop policy if exists "public read" on chat_messages;
create policy "public read" on chat_messages for select using ((not deleted and not held) or public.can_site(site_id, 'community'));

-- Reports: anyone can report; the item is hidden until a moderator keeps it (it can't be hidden again by reports)
-- or removes it. Ten reports an hour per device, one per item.
do $$ begin
  if to_regclass('public.reports') is not null then
    execute 'drop policy if exists "anyone reports" on reports';
    execute 'create policy "anyone reports" on reports for insert with check (status = ''open'')';
    execute 'drop policy if exists "moderators" on reports';
    execute $p$create policy "moderators" on reports for all to authenticated using (public.can_site(site_id, 'community')) with check (public.can_site(site_id, 'community'))$p$;
  end if;
  if to_regclass('public.trusted') is not null then
    execute 'drop policy if exists "moderators" on trusted';
    execute $p$create policy "moderators" on trusted for all to authenticated using (public.can_site(site_id, 'community')) with check (public.can_site(site_id, 'community'))$p$;
  end if;
end $$;
create or replace function public.report_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare tbl text := case new.kind when 'thread' then 'threads' when 'post' then 'posts' else 'chat_messages' end; ok boolean; n int;
begin
  if public.can_site(new.site_id, 'community') then return new; end if;
  new.status := 'open';
  execute format('select exists (select 1 from %I where id::text = $1 and site_id = $2)', tbl) into ok using new.item_id, new.site_id;
  if not ok then raise exception 'That post isn''t here anymore.' using errcode = 'P0001'; end if;
  if new.device is not null then
    select count(*) into n from reports where device = new.device and created_at > now() - interval '1 hour';
    if n >= 10 then raise exception 'That''s a lot of reports. A moderator will look at them soon.' using errcode = 'P0001'; end if;
    if exists (select 1 from reports where device = new.device and kind = new.kind and item_id = new.item_id) then return null; end if;
  end if;
  execute format('update %I set held = true where id::text = $1 and site_id = $2 and not reviewed', tbl) using new.item_id, new.site_id;
  return new;
end $$;
do $$ begin
  if to_regclass('public.reports') is not null then
    execute 'drop trigger if exists reports_guard on reports';
    execute 'create trigger reports_guard before insert on reports for each row execute function public.report_guard()';
  end if;
end $$;


/* ================= the foundation (25_foundation.sql): Coaster teams, fans and podcasts on Coasters ================= */
do $$ begin
  if to_regclass('public.comic_team') is not null then
    execute 'drop policy if exists "team and managers read" on comic_team';
    execute 'create policy "team and managers read" on comic_team for select to authenticated using (user_id = auth.uid() or public.can_manage_comic_team(comic_id) or public.can_edit_comic(comic_id))';
    execute 'drop policy if exists "coaster editors read" on comic_fans';
    execute 'create policy "coaster editors read" on comic_fans for select to authenticated using (public.can_edit_comic(comic_id))';
    execute 'drop policy if exists "coaster editors remove" on comic_fans';
    execute 'create policy "coaster editors remove" on comic_fans for delete to authenticated using (public.can_edit_comic(comic_id))';
    execute 'drop policy if exists "coaster editors switch" on comic_podcasts';
    execute 'create policy "coaster editors switch" on comic_podcasts for update to authenticated using (public.can_edit_comic(comic_id)) with check (public.can_edit_comic(comic_id))';
  end if;
end $$;

-- A fan who signs up on a site goes on the Coaster of every comic on its lineup right then.
create or replace function public.fans_to_coasters() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('public.comic_fans') is null then return new; end if;
  if tg_op = 'UPDATE' then
    update comic_fans set name = new.name, zip = new.zip, city = new.city, state = new.state, lat = new.lat, lng = new.lng, met_at = coalesce(new.met_at, met_at)
      where fan_id = new.id;
    return new;
  end if;
  insert into comic_fans (comic_id, fan_id, site_id, email, name, zip, city, state, lat, lng, met_at, source)
    select h.comic_id, new.id, new.site_id, new.email, new.name, new.zip, new.city, new.state, new.lat, new.lng, new.met_at, coalesce(new.source, 'site')
    from hosts h where h.site_id = new.site_id and h.comic_id is not null
  on conflict (comic_id, lower(email)) do nothing;
  return new;
end $$;
do $$ begin
  if to_regclass('public.comic_fans') is not null then
    execute 'drop trigger if exists fans_to_coasters on fans';
    execute 'create trigger fans_to_coasters after insert or update of name, zip, city, state, lat, lng, met_at on fans for each row execute function public.fans_to_coasters()';
  end if;
end $$;

-- A comic who joins a lineup gets that site's fans so far, and its podcasts. Leaving takes nothing away.
create or replace function public.lineup_joins() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('public.comic_fans') is null then return new; end if;
  if new.comic_id is null or (tg_op = 'UPDATE' and new.comic_id is not distinct from old.comic_id) then return new; end if;
  insert into comic_fans (comic_id, fan_id, site_id, email, name, zip, city, state, lat, lng, met_at, source)
    select new.comic_id, f.id, f.site_id, f.email, f.name, f.zip, f.city, f.state, f.lat, f.lng, f.met_at, coalesce(f.source, 'site')
    from fans f where f.site_id = new.site_id
  on conflict (comic_id, lower(email)) do nothing;
  insert into comic_podcasts (comic_id, site_id, show_name)
    select distinct new.comic_id, new.site_id, coalesce(e.show_name, '') from episodes e where e.site_id = new.site_id
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists hosts_lineup_joins on hosts;
create trigger hosts_lineup_joins after insert or update of comic_id on hosts for each row execute function public.lineup_joins();

-- A podcast a site adds shows up on the Coaster of every comic on its lineup.
create or replace function public.podcast_to_coasters() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('public.comic_fans') is null then return new; end if;
  insert into comic_podcasts (comic_id, site_id, show_name)
    select h.comic_id, new.site_id, coalesce(new.show_name, '') from hosts h where h.site_id = new.site_id and h.comic_id is not null
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists episodes_to_coasters on episodes;
create trigger episodes_to_coasters after insert on episodes for each row execute function public.podcast_to_coasters();

-- Joining a list with name, email and ZIP (every sign-up form). "Near a show" is 50 miles from the ZIP.
create or replace function public.join_list(p_site text, p_email text, p_name text, p_zip text, p_met text default null, p_source text default 'site')
returns text language plpgsql security definer set search_path = public as $$
declare z record; e text := lower(trim(p_email)); zp text := left(regexp_replace(coalesce(p_zip, ''), '[^0-9]', '', 'g'), 5); existed boolean;
  src text := case when p_source in ('site', 'qr', 'embed', 'coaster') then p_source else 'site' end;
begin
  if not exists (select 1 from sites where id = p_site and coalesce((features->>'fans')::boolean, false)) then
    raise exception 'This site isn''t taking sign-ups right now.' using errcode = 'P0001';
  end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 200 then raise exception 'That email doesn''t look right.' using errcode = 'P0001'; end if;
  select * into z from zips where zip = zp;
  if not found then raise exception 'That ZIP code doesn''t look right.' using errcode = 'P0001'; end if;
  existed := exists (select 1 from fans where site_id = p_site and lower(email) = e);
  insert into fans (site_id, email, name, zip, city, state, lat, lng, radius_mi, met_at, source)
    values (p_site, e, nullif(left(trim(coalesce(p_name, '')), 80), ''), zp, z.city, z.state, z.lat, z.lng, 50, nullif(left(trim(coalesce(p_met, '')), 200), ''), case when src = 'coaster' then 'site' else src end)
  on conflict (site_id, lower(email)) do update set name = coalesce(excluded.name, fans.name), zip = excluded.zip, city = excluded.city, state = excluded.state,
    lat = excluded.lat, lng = excluded.lng, met_at = coalesce(excluded.met_at, fans.met_at);
  return case when existed then 'updated' else 'joined' end;
end $$;
revoke all on function public.join_list(text, text, text, text, text, text) from public;
grant execute on function public.join_list(text, text, text, text, text, text) to anon, authenticated;

-- Joining a comic's own list from their Coaster (no site needed).
create or replace function public.join_coaster(p_comic text, p_email text, p_name text, p_zip text, p_met text default null)
returns text language plpgsql security definer set search_path = public as $$
declare z record; e text := lower(trim(p_email)); zp text := left(regexp_replace(coalesce(p_zip, ''), '[^0-9]', '', 'g'), 5); existed boolean;
begin
  if not exists (select 1 from comics where id = p_comic) then raise exception 'We couldn''t find that comic.' using errcode = 'P0001'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 200 then raise exception 'That email doesn''t look right.' using errcode = 'P0001'; end if;
  select * into z from zips where zip = zp;
  if not found then raise exception 'That ZIP code doesn''t look right.' using errcode = 'P0001'; end if;
  existed := exists (select 1 from comic_fans where comic_id = p_comic and lower(email) = e);
  insert into comic_fans (comic_id, email, name, zip, city, state, lat, lng, met_at, source)
    values (p_comic, e, nullif(left(trim(coalesce(p_name, '')), 80), ''), zp, z.city, z.state, z.lat, z.lng, nullif(left(trim(coalesce(p_met, '')), 200), ''), 'coaster')
  on conflict (comic_id, lower(email)) do update set name = coalesce(excluded.name, comic_fans.name), zip = excluded.zip, city = excluded.city,
    state = excluded.state, lat = excluded.lat, lng = excluded.lng;
  return case when existed then 'updated' else 'joined' end;
end $$;
revoke all on function public.join_coaster(text, text, text, text, text) from public;
grant execute on function public.join_coaster(text, text, text, text, text) to anon, authenticated;

-- "Stop emailing me": one link takes the fan off everywhere that sign-up reached (the site list and every Coaster
-- copy), or off one comic's list when they joined on the Coaster.
create or replace function public.leave_list(p_token uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from fans where token = p_token; get diagnostics n = row_count;  -- the Coaster copies go with it
  if n = 0 then delete from comic_fans where token = p_token; get diagnostics n = row_count; end if;
  return n > 0;
end $$;
revoke all on function public.leave_list(uuid) from public;
grant execute on function public.leave_list(uuid) to anon, authenticated;

-- Privacy: ComicTable staff can remove someone's email from every list on ComicTable when they ask.
create or replace function public.forget_email(p_email text) returns int
language plpgsql security definer set search_path = public as $$
declare a int; b int; e text := lower(trim(p_email));
begin
  if not public.is_platform_admin() then raise exception 'Only ComicTable staff can do that.' using errcode = 'P0001'; end if;
  delete from fans where lower(email) = e; get diagnostics a = row_count;
  delete from comic_fans where lower(email) = e; get diagnostics b = row_count;
  return a + b;
end $$;
revoke all on function public.forget_email(text) from public;
grant execute on function public.forget_email(text) to authenticated;

-- Everyone already on a lineup gets their sites' fans and podcasts (safe to run again).
do $$ begin
  if to_regclass('public.comic_fans') is not null then
    insert into comic_fans (comic_id, fan_id, site_id, email, name, zip, city, state, lat, lng, met_at, source)
      select h.comic_id, f.id, f.site_id, f.email, f.name, f.zip, f.city, f.state, f.lat, f.lng, f.met_at, coalesce(f.source, 'site')
      from fans f join hosts h on h.site_id = f.site_id and h.comic_id is not null
    on conflict (comic_id, lower(email)) do nothing;
    insert into comic_podcasts (comic_id, site_id, show_name)
      select distinct h.comic_id, e.site_id, coalesce(e.show_name, '') from episodes e join hosts h on h.site_id = e.site_id and h.comic_id is not null
    on conflict do nothing;
  end if;
end $$;
