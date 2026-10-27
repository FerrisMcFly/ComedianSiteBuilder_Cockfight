-- Platform upgrade, part 2: content any front end can use, full forum controls, and the chat room.
-- Run once in Supabase → SQL Editor, after 04 and 05. Safe to run again.

begin;

-- ========== Site profile, theme settings, community rules ==========
-- profile:   tagline, about, contact_email, booking_email, support_url, support_label, logo_url
-- theme:     values for the front end's own settings (each front end lists them in theme.json)
-- community: forum_open, chat_open, slow_mode_seconds, chat_slow_seconds, banned_words[], reserve_names
alter table sites add column if not exists profile jsonb not null default '{}';
alter table sites add column if not exists theme jsonb not null default '{}';
alter table sites add column if not exists community jsonb not null default
  '{"forum_open": true, "chat_open": true, "slow_mode_seconds": 20, "chat_slow_seconds": 3, "banned_words": [], "reserve_names": true}';

update sites set profile = profile || jsonb_build_object(
    'tagline', 'A weekly comedy podcast with Colum Tyrrell, Lev Fer and Tristan Bowling.',
    'about', 'Cockfight is a weekly comedy podcast with stand-up comics Colum Tyrrell, Lev Fer and Tristan Bowling.',
    'support_url', 'https://www.patreon.com/CockFightPod',
    'support_label', 'Patreon')
  where id = 'cockfight' and not (profile ? 'support_url');

-- ========== Announcements: a list any front end can show its own way ==========
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references sites(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 280),
  link text,
  link_label text,
  starts_on date,
  ends_on date,
  pinned boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists announcements_site_idx on announcements (site_id);

-- Move the old banner text in, one announcement per "•••" item. The old headline becomes the pinned one.
insert into announcements (site_id, text, sort)
select s.site_id, trim(part), ord::int
from settings s, regexp_split_to_table(s.value, '\s*•••\s*') with ordinality as t(part, ord)
where s.key = 'marquee' and trim(coalesce(part, '')) <> ''
  and not exists (select 1 from announcements a where a.site_id = s.site_id);
insert into announcements (site_id, text, pinned, sort)
select s.site_id, s.value, true, -1 from settings s
where s.key = 'headline' and coalesce(trim(s.value), '') <> ''
  and not exists (select 1 from announcements a where a.site_id = s.site_id and a.pinned);

-- ========== Links (a Linktree-style list) ==========
create table if not exists links (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references sites(id) on delete cascade,
  label text not null,
  url text not null,
  icon text,
  sort int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists links_site_idx on links (site_id);

-- ========== Forum boards ==========
create table if not exists boards (
  site_id text not null references sites(id) on delete cascade,
  id text not null,
  name text not null,
  description text,
  sort int not null default 0,
  locked boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (site_id, id)
);
insert into boards (site_id, id, name, description, sort) values
  ('cockfight', 'general', 'General Discusión', 'Talk about the podcast, the hosts, whatever', 0),
  ('cockfight', 'episodes', 'Episode Talk', 'Spoilers allowed. Put the episode # in your subject!!', 1),
  ('cockfight', 'tour', 'Live Shows & Tour', 'Going to a show? Saw one? Post here', 2),
  ('cockfight', 'cantina', 'Off Topic', 'Anything goes. Be cool.', 3)
on conflict do nothing;

alter table threads drop constraint if exists threads_board_check;
alter table threads add column if not exists pinned boolean not null default false;
alter table threads add column if not exists locked boolean not null default false;
alter table threads add column if not exists device text;
alter table threads add column if not exists is_mod boolean not null default false;
alter table posts add column if not exists device text;
alter table posts add column if not exists is_mod boolean not null default false;
alter table posts add column if not exists edited_at timestamptz;

-- ========== Chat ==========
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references sites(id) on delete cascade,
  author text not null check (char_length(author) between 1 and 24),
  body text not null check (char_length(body) between 1 and 500),
  device text,
  is_mod boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists chat_site_time on chat_messages (site_id, created_at desc);

-- ========== Bans + moderator log ==========
create table if not exists bans (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references sites(id) on delete cascade,
  author text,
  device text,
  reason text,
  until timestamptz,          -- null = forever
  created_at timestamptz not null default now(),
  check (author is not null or device is not null)
);
create index if not exists bans_site_idx on bans (site_id);

create table if not exists mod_log (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references sites(id) on delete cascade,
  actor uuid default auth.uid(),
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists mod_log_site_time on mod_log (site_id, created_at desc);

-- ========== The rules every fan post goes through ==========
create or replace function public.community_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c jsonb;
  admin_ok boolean := public.is_site_admin(new.site_id);
  wait_s int;
  txt text;
  w text;
  b record;
begin
  -- the poster's name, trimmed
  new.author := trim(new.author);
  if admin_ok then return new; end if;
  new.is_mod := false;            -- only admins get the host badge

  select community into c from sites where id = new.site_id;
  c := coalesce(c, '{}'::jsonb);

  if tg_table_name = 'chat_messages' then
    if coalesce((c->>'chat_open')::boolean, true) = false then raise exception 'The chat is closed right now.' using errcode = 'P0001'; end if;
    wait_s := coalesce((c->>'chat_slow_seconds')::int, 0);
    txt := new.body;
  else
    if coalesce((c->>'forum_open')::boolean, true) = false then raise exception 'The forum is closed for posting right now.' using errcode = 'P0001'; end if;
    wait_s := coalesce((c->>'slow_mode_seconds')::int, 0);
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

  -- slow mode (per device, falling back to per name)
  if wait_s > 0 then
    if tg_table_name = 'chat_messages' then
      if exists (select 1 from chat_messages m where m.site_id = new.site_id
                   and ((new.device is not null and m.device = new.device) or lower(m.author) = lower(new.author))
                   and m.created_at > now() - make_interval(secs => wait_s)) then
        raise exception 'Slow down! Wait a few seconds between messages.' using errcode = 'P0001'; end if;
    else
      if exists (select 1 from posts p where p.site_id = new.site_id
                   and ((new.device is not null and p.device = new.device) or lower(p.author) = lower(new.author))
                   and p.created_at > (extract(epoch from now()) * 1000 - wait_s * 1000)) then
        raise exception 'Slow down! Wait a little before posting again.' using errcode = 'P0001'; end if;
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

-- Keep the chat from growing forever: drop messages older than 14 days now and then
create or replace function public.chat_prune() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if random() < 0.02 then
    delete from chat_messages where site_id = new.site_id and created_at < now() - interval '14 days';
  end if;
  return null;
end $$;
drop trigger if exists chat_prune on chat_messages;
create trigger chat_prune after insert on chat_messages for each row execute function public.chat_prune();

-- ========== Who can do what ==========
alter table announcements enable row level security;
alter table links enable row level security;
alter table boards enable row level security;
alter table chat_messages enable row level security;
alter table bans enable row level security;
alter table mod_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['announcements', 'links', 'boards'] loop
    execute format('drop policy if exists "public read" on %I', t);
    execute format('create policy "public read" on %I for select using (true)', t);
    execute format('drop policy if exists "site admin write" on %I', t);
    execute format('create policy "site admin write" on %I for all to authenticated using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id))', t);
  end loop;
  foreach t in array array['bans', 'mod_log'] loop
    execute format('drop policy if exists "site admin manage" on %I', t);
    execute format('create policy "site admin manage" on %I for all to authenticated using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id))', t);
  end loop;
end $$;

drop policy if exists "public read" on chat_messages;
create policy "public read" on chat_messages for select using (not deleted or public.is_site_admin(site_id));
drop policy if exists "anyone chats" on chat_messages;
create policy "anyone chats" on chat_messages for insert with check (deleted = false);
drop policy if exists "site admin manage" on chat_messages;
create policy "site admin manage" on chat_messages for all to authenticated using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id));

-- Fans can't create topics that are already pinned or locked
drop policy if exists "anyone posts" on threads;
create policy "anyone posts" on threads for insert with check (replies = 0 and pinned = false and locked = false);

grant select on announcements, links, boards, chat_messages to anon, authenticated;
grant insert on chat_messages to anon, authenticated;
grant insert, update, delete on announcements, links, boards, chat_messages, bans, mod_log to authenticated;
grant select on bans, mod_log to authenticated;

-- Live updates for the chat room (Supabase Realtime)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
    execute 'alter publication supabase_realtime add table chat_messages';
  end if;
end $$;

commit;
