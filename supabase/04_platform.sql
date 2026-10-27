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
insert into platform_admins (user_id) select distinct user_id from admins on conflict do nothing;

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
