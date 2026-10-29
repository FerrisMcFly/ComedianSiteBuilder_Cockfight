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
