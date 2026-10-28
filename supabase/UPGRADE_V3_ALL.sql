-- ComicTable v3: every database change since v2 (home screen, photo uploads, press kit, QR fan sign-up, more socials) in one file. Paste it all into Supabase → SQL Editor and click Run.
-- Same as running 15, 16, 17, 18, 19 in order. Safe to run again, and safe if you already ran some of them.

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
