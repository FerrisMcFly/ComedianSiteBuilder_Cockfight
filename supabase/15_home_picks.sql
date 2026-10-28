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
