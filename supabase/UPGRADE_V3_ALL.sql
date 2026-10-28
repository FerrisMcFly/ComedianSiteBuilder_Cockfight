-- ComicTable v3: every database change since v2 (home screen, photo uploads, press kit) in one file. Paste it all into Supabase → SQL Editor and click Run.
-- Same as running 15, 16, 17 in order. Safe to run again, and safe if you already ran some of them.

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
