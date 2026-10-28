-- Show finder: comics give ComicTable the pages where their dates are listed (their tour page, a club's
-- calendar, Eventbrite, a calendar feed), and it checks them every hour. Each link either adds new dates
-- straight away or puts them in a "Found shows" list to check first.
-- Run once in Supabase → SQL Editor, after 11_comics.sql. Safe to run again.

alter table sources drop constraint if exists sources_kind_check;
alter table sources add constraint sources_kind_check check (kind in ('podcast', 'youtube', 'shows'));
alter table sources add column if not exists auto_add boolean not null default false;  -- shows: add new dates without asking
alter table sources add column if not exists match_all boolean not null default false; -- shows: every show on the page is theirs (their own tour page)

create table if not exists found_shows (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id) on delete cascade,
  site_id text not null references sites(id) on delete cascade,
  comic_id text references comics(id) on delete cascade,
  key text not null,                 -- date + time + venue, so the same listing is only found once
  date date not null,
  time text,
  venue text,
  city text,
  venue_id uuid references venues(id) on delete set null,
  url text,
  status text not null default 'on_sale',
  title text,                        -- the listing's own name, e.g. "Tristan Bowling Live!"
  state text not null default 'new' check (state in ('new', 'added', 'ignored')),
  created_at timestamptz not null default now()
);
create unique index if not exists found_shows_key on found_shows (coalesce(comic_id, site_id), key);
alter table found_shows enable row level security;
drop policy if exists "site admins" on found_shows;
create policy "site admins" on found_shows for all to authenticated using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id));
drop policy if exists "comic editors" on found_shows;
create policy "comic editors" on found_shows for all to authenticated
  using (comic_id is not null and public.can_edit_comic(comic_id)) with check (comic_id is not null and public.can_edit_comic(comic_id));
grant select, insert, update, delete on found_shows to authenticated;
