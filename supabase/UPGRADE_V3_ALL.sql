-- ComicTable v3: every database change since v2 (home screen, photo uploads, press kit, QR fan sign-up, more socials, comictable.com showcase, roles) in one file. Paste it all into Supabase → SQL Editor and click Run.
-- Same as running 15, 16, 17, 18, 19, 20, 21 in order. Safe to run again, and safe if you already ran some of them.

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

-- ============================== 21_roles.sql ==============================
-- Roles.
-- ComicTable staff (platform_admins):
--   admin: everything, including staff, creating sites, deleting comics and the comictable.com showcase
--   staff: works on every site and comic, but can't add or remove staff, create sites, delete comics,
--          or change what comictable.com shows off
-- A site's team (admins):
--   owner: everything on the site, including the team
--   editor: everything but the team
--   shows: dates, ticket links, clubs and the show finder only
--   moderator: forum, chat, bans and the moderation log only
-- Run once in Supabase → SQL Editor, after 20_showcase.sql. Safe to run again.

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

-- A comic's profile: the comic, ComicTable staff, and owners/editors of any site they're on.
create or replace function public.can_edit_comic(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
      or exists (select 1 from comics where id = c and user_id = auth.uid())
      or exists (select 1 from hosts h join admins a on a.site_id = h.site_id and a.user_id = auth.uid() and a.role in ('owner', 'editor') where h.comic_id = c);
$$;
-- A comic's dates: the same people, plus "shows" people on any site they're on.
create or replace function public.can_edit_comic_dates(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_edit_comic(c)
      or exists (select 1 from hosts h join admins a on a.site_id = h.site_id and a.user_id = auth.uid() and a.role = 'shows' where h.comic_id = c);
$$;
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
drop policy if exists "super admins write" on platform_settings;
create policy "super admins write" on platform_settings for all to authenticated
  using (public.is_platform_owner()) with check (public.is_platform_owner());
