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
