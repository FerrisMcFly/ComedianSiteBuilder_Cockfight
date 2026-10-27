-- ComicTable v1 upgrade: everything in one file (03 + 04 + 05 + 06). Paste it all into Supabase → SQL Editor and click Run.
-- Safe to run more than once.

-- ===================== 03_permissions.sql =====================
-- Table permissions for the public site and the admin page. Safe to run more than once.
grant usage on schema public to anon, authenticated;
grant select on hosts, shows, episodes, settings, threads, posts to anon, authenticated;
grant insert on threads, posts to anon, authenticated;
grant insert, update, delete on hosts, shows, episodes, settings to authenticated;
grant delete on threads, posts to authenticated;

-- ===================== 04_platform.sql =====================
-- Platform upgrade, step 1. Run once in Supabase → SQL Editor, after 01–03.
-- Safe for the live site: everything that exists keeps working, and all current content becomes site "cockfight".

begin;

-- ========== Sites ==========
create table if not exists sites (
  id text primary key,
  name text not null,
  domain text,
  features jsonb not null default '{"shows": true, "podcast": true, "videos": true, "merch": false, "forum": true, "chat": false}',
  created_at timestamptz not null default now()
);
insert into sites (id, name, domain, features)
values ('cockfight', 'Cockfight', 'cockfightpodcast.com', '{"shows": true, "podcast": true, "videos": true, "merch": false, "forum": true, "chat": false}')
on conflict (id) do nothing;
alter table sites enable row level security;
drop policy if exists "public read" on sites;
create policy "public read" on sites for select using (true);

-- ========== Admins become per site ==========
alter table admins add column if not exists site_id text not null default 'cockfight' references sites(id) on delete cascade;
alter table admins add column if not exists role text not null default 'owner';
alter table admins drop constraint if exists admins_pkey;
alter table admins add primary key (user_id, site_id);
drop policy if exists "see own admin rows" on admins;
create policy "see own admin rows" on admins for select to authenticated using (user_id = auth.uid());

-- Platform admins approve new clubs for the shared club list. Current admins start as platform admins.
create table if not exists platform_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table platform_admins enable row level security;
drop policy if exists "see self" on platform_admins;
create policy "see self" on platform_admins for select to authenticated using (user_id = auth.uid());
-- Only on the very first run: later runs must not turn every site admin into a platform admin.
insert into platform_admins (user_id) select distinct user_id from admins where not exists (select 1 from platform_admins) on conflict do nothing;

create or replace function public.is_site_admin(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and site_id = sid);
$$;
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;
grant execute on function public.is_site_admin(text) to anon, authenticated;
grant execute on function public.is_platform_admin() to anon, authenticated;

drop policy if exists "site admins update their site" on sites;
create policy "site admins update their site" on sites for update to authenticated
  using (public.is_site_admin(id)) with check (public.is_site_admin(id));

-- ========== Tag all content with its site ==========
do $$
declare t text;
begin
  foreach t in array array['hosts', 'shows', 'episodes', 'settings', 'threads', 'posts'] loop
    execute format('alter table %I add column if not exists site_id text not null default %L references sites(id) on delete cascade', t, 'cockfight');
    execute format('create index if not exists %I on %I (site_id)', t || '_site_idx', t);
  end loop;
end $$;

alter table settings drop constraint if exists settings_pkey;
alter table settings add primary key (site_id, key);

-- Admin rights now only reach your own site's content
do $$
declare t text;
begin
  foreach t in array array['hosts', 'shows', 'episodes', 'settings'] loop
    execute format('drop policy if exists "admin write" on %I', t);
    execute format('drop policy if exists "site admin write" on %I', t);
    execute format('create policy "site admin write" on %I for all to authenticated using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id))', t);
  end loop;
  foreach t in array array['threads', 'posts'] loop
    execute format('drop policy if exists "admin delete" on %I', t);
    execute format('drop policy if exists "site admin manage" on %I', t);
    execute format('create policy "site admin manage" on %I for all to authenticated using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id))', t);
  end loop;
end $$;

-- ========== Shared club database ==========
create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  state text,
  country text not null default 'US',
  address text,
  website text,
  default_times jsonb,            -- optional: {"5": ["7:00 PM", "9:30 PM"], ...} keyed by weekday, 0 = Sunday
  status text not null default 'approved' check (status in ('approved', 'pending')),
  verified boolean not null default false,
  created_by_site text references sites(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists venues_name_city on venues (lower(name), lower(city), coalesce(lower(state), ''));
alter table venues enable row level security;
-- Any site admin can add a club and it's shared with every site right away (unverified until a platform admin checks it).
-- The site that added an unverified club can still fix or remove it; platform admins can edit anything.
drop policy if exists "read venues" on venues;
create policy "read venues" on venues for select using (
  status = 'approved' or public.is_site_admin(created_by_site) or public.is_platform_admin());
drop policy if exists "add venues" on venues;
create policy "add venues" on venues for insert to authenticated with check (
  public.is_platform_admin() or (verified = false and public.is_site_admin(created_by_site)));
drop policy if exists "edit venues" on venues;
create policy "edit venues" on venues for update to authenticated using (
  public.is_platform_admin() or (verified = false and public.is_site_admin(created_by_site)))
  with check (public.is_platform_admin() or (verified = false and public.is_site_admin(created_by_site)));
drop policy if exists "remove venues" on venues;
create policy "remove venues" on venues for delete to authenticated using (
  public.is_platform_admin() or (verified = false and public.is_site_admin(created_by_site)));

-- ========== Shows: link to a club, add status ==========
alter table shows add column if not exists venue_id uuid references venues(id) on delete set null;
alter table shows add column if not exists status text not null default 'on_sale';
alter table shows drop constraint if exists shows_status_check;
alter table shows add constraint shows_status_check check (status in ('on_sale', 'few_left', 'sold_out', 'cancelled', 'free'));
alter table shows add column if not exists note text;
create index if not exists shows_venue_idx on shows (venue_id);

-- The usual showtimes at a club, learned from every show entered there (across all sites; only counts are shared)
create or replace function public.venue_slots(v uuid) returns table (dow int, show_time text, uses bigint)
language sql stable security definer set search_path = public as $$
  select extract(dow from date)::int as dow, time as show_time, count(*) as uses
  from shows where venue_id = v and time is not null
  group by 1, 2 order by 1, 3 desc;
$$;
grant execute on function public.venue_slots(uuid) to authenticated;

-- ========== Podcast + YouTube imports ==========
create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references sites(id) on delete cascade,
  kind text not null check (kind in ('podcast', 'youtube')),
  url text not null,
  label text,
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_status text,
  created_at timestamptz not null default now()
);
alter table sources enable row level security;
drop policy if exists "site admin manage" on sources;
create policy "site admin manage" on sources for all to authenticated
  using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id));

alter table episodes add column if not exists guid text;
alter table episodes add column if not exists audio_url text;
alter table episodes add column if not exists image_url text;
alter table episodes add column if not exists hidden boolean not null default false;
alter table episodes add column if not exists imported_at timestamptz;
create unique index if not exists episodes_site_guid on episodes (site_id, guid) where guid is not null;

create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references sites(id) on delete cascade,
  youtube_id text not null,
  title text not null,
  published date,
  thumbnail_url text,
  url text,
  featured boolean not null default false,
  hidden boolean not null default false,
  imported_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists videos_site_yt on videos (site_id, youtube_id);

create table if not exists merch (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references sites(id) on delete cascade,
  name text not null,
  price text,
  image_url text,
  url text,
  sort int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['videos', 'merch'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "public read" on %I', t);
    execute format('create policy "public read" on %I for select using (true)', t);
    execute format('drop policy if exists "site admin write" on %I', t);
    execute format('create policy "site admin write" on %I for all to authenticated using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id))', t);
  end loop;
end $$;

-- Photos: admins upload into their own site's folder (or the old shared spot)
drop policy if exists "admin upload photos" on storage.objects;
drop policy if exists "admin update photos" on storage.objects;
drop policy if exists "admin delete photos" on storage.objects;
create policy "admin upload photos" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.is_admin());
create policy "admin update photos" on storage.objects for update to authenticated using (bucket_id = 'photos' and public.is_admin());
create policy "admin delete photos" on storage.objects for delete to authenticated using (bucket_id = 'photos' and public.is_admin());

-- ========== Permissions ==========
grant usage on schema public to anon, authenticated;
grant select on sites, hosts, shows, episodes, settings, threads, posts, venues, videos, merch to anon, authenticated;
grant insert on threads, posts to anon, authenticated;
grant update on sites to authenticated;
grant select on admins, platform_admins to authenticated;
grant insert, update, delete on hosts, shows, episodes, settings, threads, posts, venues, sources, videos, merch to authenticated;
grant select on sources to authenticated;

commit;

-- ===================== 05_venues.sql =====================
-- Starter list for the shared club database. Run once, after 04_platform.sql.
-- These are unverified starting entries: comics can correct them, and new rooms get added as they're used.
insert into venues (name, city, state, status, verified) values
  ('Comedy Cellar', 'New York', 'NY', 'approved', false),
  ('The Stand NYC', 'New York', 'NY', 'approved', false),
  ('Gotham Comedy Club', 'New York', 'NY', 'approved', false),
  ('Comic Strip Live', 'New York', 'NY', 'approved', false),
  ('Stand Up NY', 'New York', 'NY', 'approved', false),
  ('New York Comedy Club', 'New York', 'NY', 'approved', false),
  ('Broadway Comedy Club', 'New York', 'NY', 'approved', false),
  ('West Side Comedy Club', 'New York', 'NY', 'approved', false),
  ('The Grisly Pear', 'New York', 'NY', 'approved', false),
  ('Eastville Comedy Club', 'Brooklyn', 'NY', 'approved', false),
  ('Governor''s Comedy Club', 'Levittown', 'NY', 'approved', false),
  ('Helium Comedy Club Buffalo', 'Buffalo', 'NY', 'approved', false),
  ('Funny Bone Albany', 'Albany', 'NY', 'approved', false),
  ('Funny Bone Syracuse', 'Syracuse', 'NY', 'approved', false),
  ('The Stress Factory', 'New Brunswick', 'NJ', 'approved', false),
  ('Laugh Boston', 'Boston', 'MA', 'approved', false),
  ('Nick''s Comedy Stop', 'Boston', 'MA', 'approved', false),
  ('Improv Asylum', 'Boston', 'MA', 'approved', false),
  ('The Comedy Studio', 'Cambridge', 'MA', 'approved', false),
  ('Giggles Comedy Club', 'Saugus', 'MA', 'approved', false),
  ('Helium Comedy Club Philadelphia', 'Philadelphia', 'PA', 'approved', false),
  ('Punch Line Philly', 'Philadelphia', 'PA', 'approved', false),
  ('Pittsburgh Improv', 'Pittsburgh', 'PA', 'approved', false),
  ('DC Improv', 'Washington', 'DC', 'approved', false),
  ('Drafthouse Comedy', 'Washington', 'DC', 'approved', false),
  ('Magooby''s Joke House', 'Timonium', 'MD', 'approved', false),
  ('Richmond Funny Bone', 'Richmond', 'VA', 'approved', false),
  ('Virginia Beach Funny Bone', 'Virginia Beach', 'VA', 'approved', false),
  ('Raleigh Improv', 'Cary', 'NC', 'approved', false),
  ('Goodnights Comedy Club', 'Raleigh', 'NC', 'approved', false),
  ('The Comedy Club at Duckworth''s', 'Charlotte', 'NC', 'approved', false),
  ('The Comedy Zone Charlotte', 'Charlotte', 'NC', 'approved', false),
  ('The Punchline', 'Sandy Springs', 'GA', 'approved', false),
  ('Laughing Skull Lounge', 'Atlanta', 'GA', 'approved', false),
  ('Zanies Nashville', 'Nashville', 'TN', 'approved', false),
  ('Third Coast Comedy Club', 'Nashville', 'TN', 'approved', false),
  ('Fort Lauderdale Improv', 'Fort Lauderdale', 'FL', 'approved', false),
  ('Miami Improv', 'Miami', 'FL', 'approved', false),
  ('Palm Beach Improv', 'West Palm Beach', 'FL', 'approved', false),
  ('Orlando Improv', 'Orlando', 'FL', 'approved', false),
  ('Tampa Improv', 'Tampa', 'FL', 'approved', false),
  ('Side Splitters Comedy Club', 'Tampa', 'FL', 'approved', false),
  ('Off the Hook Comedy Club', 'Naples', 'FL', 'approved', false),
  ('The Comedy Zone Jacksonville', 'Jacksonville', 'FL', 'approved', false),
  ('Hilarities 4th Street Theatre', 'Cleveland', 'OH', 'approved', false),
  ('Cleveland Improv', 'Cleveland', 'OH', 'approved', false),
  ('Columbus Funny Bone', 'Columbus', 'OH', 'approved', false),
  ('Liberty Funny Bone', 'West Chester', 'OH', 'approved', false),
  ('Go Bananas Comedy Club', 'Cincinnati', 'OH', 'approved', false),
  ('Dayton Funny Bone', 'Dayton', 'OH', 'approved', false),
  ('Toledo Funny Bone', 'Toledo', 'OH', 'approved', false),
  ('Mark Ridley''s Comedy Castle', 'Royal Oak', 'MI', 'approved', false),
  ('Helium Comedy Club Indianapolis', 'Indianapolis', 'IN', 'approved', false),
  ('Morty''s Comedy Joint', 'Indianapolis', 'IN', 'approved', false),
  ('Zanies Chicago', 'Chicago', 'IL', 'approved', false),
  ('Laugh Factory Chicago', 'Chicago', 'IL', 'approved', false),
  ('The Second City', 'Chicago', 'IL', 'approved', false),
  ('The Lincoln Lodge', 'Chicago', 'IL', 'approved', false),
  ('Zanies Rosemont', 'Rosemont', 'IL', 'approved', false),
  ('Improv Schaumburg', 'Schaumburg', 'IL', 'approved', false),
  ('Milwaukee Improv', 'Brookfield', 'WI', 'approved', false),
  ('Acme Comedy Co.', 'Minneapolis', 'MN', 'approved', false),
  ('Rick Bronson''s House of Comedy', 'Bloomington', 'MN', 'approved', false),
  ('Helium Comedy Club St. Louis', 'St. Louis', 'MO', 'approved', false),
  ('St. Louis Funny Bone', 'St. Louis', 'MO', 'approved', false),
  ('Kansas City Improv', 'Kansas City', 'MO', 'approved', false),
  ('Stanford''s Comedy Club', 'Kansas City', 'MO', 'approved', false),
  ('Funny Bone Omaha', 'Omaha', 'NE', 'approved', false),
  ('Funny Bone Des Moines', 'West Des Moines', 'IA', 'approved', false),
  ('Comedy Works Downtown', 'Denver', 'CO', 'approved', false),
  ('Comedy Works South', 'Greenwood Village', 'CO', 'approved', false),
  ('Denver Improv', 'Denver', 'CO', 'approved', false),
  ('Wiseguys Comedy Club', 'Salt Lake City', 'UT', 'approved', false),
  ('Tempe Improv', 'Tempe', 'AZ', 'approved', false),
  ('Stand Up Live', 'Phoenix', 'AZ', 'approved', false),
  ('Mic Drop Comedy', 'Chandler', 'AZ', 'approved', false),
  ('Laugh Factory Las Vegas', 'Las Vegas', 'NV', 'approved', false),
  ('Comedy Cellar Las Vegas', 'Las Vegas', 'NV', 'approved', false),
  ('Brad Garrett''s Comedy Club', 'Las Vegas', 'NV', 'approved', false),
  ('The Comedy Store', 'West Hollywood', 'CA', 'approved', false),
  ('Hollywood Improv', 'Los Angeles', 'CA', 'approved', false),
  ('Laugh Factory Hollywood', 'Los Angeles', 'CA', 'approved', false),
  ('Largo at the Coronet', 'Los Angeles', 'CA', 'approved', false),
  ('Dynasty Typewriter', 'Los Angeles', 'CA', 'approved', false),
  ('The Ice House', 'Pasadena', 'CA', 'approved', false),
  ('The Comedy & Magic Club', 'Hermosa Beach', 'CA', 'approved', false),
  ('Flappers Comedy Club', 'Burbank', 'CA', 'approved', false),
  ('Brea Improv', 'Brea', 'CA', 'approved', false),
  ('Irvine Improv', 'Irvine', 'CA', 'approved', false),
  ('Ontario Improv', 'Ontario', 'CA', 'approved', false),
  ('Oxnard Levity Live', 'Oxnard', 'CA', 'approved', false),
  ('The Comedy Store La Jolla', 'La Jolla', 'CA', 'approved', false),
  ('American Comedy Co.', 'San Diego', 'CA', 'approved', false),
  ('Mic Drop Comedy San Diego', 'San Diego', 'CA', 'approved', false),
  ('Cobb''s Comedy Club', 'San Francisco', 'CA', 'approved', false),
  ('Punch Line San Francisco', 'San Francisco', 'CA', 'approved', false),
  ('San Jose Improv', 'San Jose', 'CA', 'approved', false),
  ('Rooster T. Feathers', 'Sunnyvale', 'CA', 'approved', false),
  ('Punch Line Sacramento', 'Sacramento', 'CA', 'approved', false),
  ('Helium Comedy Club Portland', 'Portland', 'OR', 'approved', false),
  ('Comedy Underground', 'Seattle', 'WA', 'approved', false),
  ('Laughs Comedy Club', 'Kirkland', 'WA', 'approved', false),
  ('Addison Improv', 'Addison', 'TX', 'approved', false),
  ('Arlington Improv', 'Arlington', 'TX', 'approved', false),
  ('Houston Improv', 'Houston', 'TX', 'approved', false),
  ('The Secret Group', 'Houston', 'TX', 'approved', false),
  ('Comedy Mothership', 'Austin', 'TX', 'approved', false),
  ('Sunset Strip Comedy Club', 'Austin', 'TX', 'approved', false),
  ('Hyena''s Comedy Nightclub', 'Fort Worth', 'TX', 'approved', false)
on conflict do nothing;

-- Link Cockfight's existing shows to their clubs
update shows s set venue_id = v.id
from venues v
where s.venue_id is null and s.venue is not null
  and lower(v.name) = lower(s.venue)
  and lower(s.city) like lower(v.city) || '%';

-- ===================== 06_community.sql =====================
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

-- People can be hidden from the site without deleting them
alter table hosts add column if not exists hidden boolean not null default false;

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
