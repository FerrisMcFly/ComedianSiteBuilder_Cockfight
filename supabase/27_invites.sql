-- Invite links (Step 3, founder Oct 29): the dashboard makes a one-time link to text a comic. They tap it, pick a
-- username and password, and land on their Coaster. No email needed. A link works once and lasts 7 days.
-- Whoever can edit the Coaster can invite its comic (ComicTable staff, or a site's owners and editors for a comic
-- on their site who hasn't claimed their Coaster yet). The link is redeemed by the invite function with the
-- service key; nobody reads invites from the outside.
-- Run once in Supabase → SQL Editor, after 26_customize.sql. Safe to run again.

create table if not exists invites (
  token uuid primary key default gen_random_uuid(),
  comic_id text not null references comics(id) on delete cascade,
  site_id text references sites(id) on delete cascade,      -- the site they're joining, if any (their role there)
  site_role text check (site_role is null or site_role in ('owner', 'editor', 'shows', 'moderator')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null
);
create index if not exists invites_comic on invites (comic_id);
alter table invites enable row level security;
grant select, insert, delete on invites to authenticated;
