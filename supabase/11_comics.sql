-- Comics are people on ComicTable, not on one site.
-- A comic has one profile, one set of stand-up dates and their own YouTube channels, and can be on
-- several sites (their own site, plus any podcast they co-host). Add a date once and it shows everywhere
-- they're listed. Sites can still write their own bio and title for a comic.
-- Run once in Supabase → SQL Editor, after 10_fans.sql. Safe to run again.

/* ---------------- comics ---------------- */
create table if not exists comics (
  id text primary key,
  name text not null,
  title text default 'Comedian',
  bio text default '',
  status text,
  photo_url text,
  instagram text,
  youtube text,
  tiktok text,
  twitter text,
  website text,
  user_id uuid references auth.users(id) on delete set null,  -- the comic's own login, once they have one
  created_at timestamptz not null default now()
);

-- A site's lineup stays in "hosts": one row per comic per site, with the site's order, hide switch,
-- and (optionally) the site's own bio and title. Name, photo, socials and status always come from the comic.
alter table hosts add column if not exists comic_id text references comics(id) on delete cascade;
alter table hosts add column if not exists own_bio boolean not null default false;
alter table hosts add column if not exists own_title boolean not null default false;
create unique index if not exists hosts_site_comic on hosts (site_id, comic_id);

create or replace function public.comic_slug(n text) returns text language sql immutable as $$
  select coalesce(nullif(trim(both '-' from lower(regexp_replace(trim(n), '[^a-zA-Z0-9]+', '-', 'g'))), ''), 'comic');
$$;

-- Everyone already on a site becomes a comic. People with the same name on two sites become one comic.
insert into comics (id, name, title, bio, status, photo_url, instagram, youtube, tiktok, twitter, website)
select distinct on (public.comic_slug(name)) public.comic_slug(name), name, title, bio, status, photo_url, instagram, youtube, tiktok, twitter, website
from hosts where comic_id is null
order by public.comic_slug(name), sort
on conflict (id) do nothing;
update hosts set comic_id = public.comic_slug(name) where comic_id is null;

-- Who can change a comic: the comic, ComicTable super admins, and the team of any site they're on.
create or replace function public.can_edit_comic(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
      or exists (select 1 from comics where id = c and user_id = auth.uid())
      or exists (select 1 from hosts h join admins a on a.site_id = h.site_id and a.user_id = auth.uid() where h.comic_id = c);
$$;
grant execute on function public.can_edit_comic(text) to anon, authenticated;

alter table comics enable row level security;
drop policy if exists "public read" on comics;
create policy "public read" on comics for select using (true);
drop policy if exists "editors update" on comics;
create policy "editors update" on comics for update to authenticated using (public.can_edit_comic(id)) with check (public.can_edit_comic(id));
drop policy if exists "admins add" on comics;
create policy "admins add" on comics for insert to authenticated
  with check (exists (select 1 from admins where user_id = auth.uid()) or exists (select 1 from platform_admins where user_id = auth.uid()));
drop policy if exists "super admins delete" on comics;
create policy "super admins delete" on comics for delete to authenticated using (exists (select 1 from platform_admins where user_id = auth.uid()));
grant select on comics to anon, authenticated;
grant insert, update, delete on comics to authenticated;

-- Keep every site's copy of a comic in step with their profile (skipping a site's own bio/title).
create or replace function public.comic_to_hosts() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update hosts set name = new.name, status = new.status, photo_url = new.photo_url, instagram = new.instagram, youtube = new.youtube,
    tiktok = new.tiktok, twitter = new.twitter, website = new.website,
    bio = case when own_bio then bio else new.bio end, title = case when own_title then title else new.title end
  where comic_id = new.id;
  return new;
end $$;
drop trigger if exists comics_sync on comics;
create trigger comics_sync after update on comics for each row execute function public.comic_to_hosts();

-- When a comic joins a site, or a site goes back to the shared bio/title, copy from the comic.
create or replace function public.host_from_comic() returns trigger language plpgsql set search_path = public as $$
declare c record;
begin
  if new.comic_id is null then return new; end if;
  select * into c from comics where id = new.comic_id;
  if not found then return new; end if;
  new.name := c.name; new.status := c.status; new.photo_url := c.photo_url; new.instagram := c.instagram; new.youtube := c.youtube;
  new.tiktok := c.tiktok; new.twitter := c.twitter; new.website := c.website;
  if not new.own_bio then new.bio := c.bio; end if;
  if not new.own_title then new.title := c.title; end if;
  return new;
end $$;
drop trigger if exists hosts_from_comic on hosts;
create trigger hosts_from_comic before insert or update of comic_id, own_bio, own_title on hosts for each row execute function public.host_from_comic();

/* ---------------- shows ---------------- */
-- A solo date belongs to a comic (comic_id). A show event ("Modern Apes LIVE") belongs to a site, with a lineup.
alter table shows add column if not exists comic_id text references comics(id) on delete cascade;
alter table shows add column if not exists lineup text[];
alter table shows alter column host drop not null;
-- Taking someone off a site must not delete their dates: they belong to the comic now.
alter table shows drop constraint if exists shows_host_fkey;
alter table shows add constraint shows_host_fkey foreign key (host) references hosts(id) on delete set null;
update shows s set comic_id = h.comic_id from hosts h where s.host = h.id and s.comic_id is null;

-- A date's comic follows whoever it's assigned to. (When someone leaves a site, host goes empty but the date stays theirs.)
create or replace function public.show_comic() returns trigger language plpgsql set search_path = public as $$
begin
  if new.host is not null and (tg_op = 'INSERT' or new.host is distinct from old.host) then
    select comic_id into new.comic_id from hosts where id = new.host;
  end if;
  return new;
end $$;
drop trigger if exists shows_comic on shows;
create trigger shows_comic before insert or update of host on shows for each row execute function public.show_comic();

drop policy if exists "comic editors" on shows;
create policy "comic editors" on shows for all to authenticated
  using (comic_id is not null and public.can_edit_comic(comic_id)) with check (comic_id is not null and public.can_edit_comic(comic_id));

/* ---------------- YouTube ---------------- */
alter table sources add column if not exists comic_id text references comics(id) on delete cascade;
alter table videos add column if not exists comic_id text references comics(id) on delete set null;
update sources s set comic_id = h.comic_id from hosts h where s.host = h.id and s.comic_id is null;
update videos v set comic_id = h.comic_id from hosts h where v.host = h.id and v.comic_id is null;
drop policy if exists "comic editors" on sources;
create policy "comic editors" on sources for all to authenticated
  using (comic_id is not null and public.can_edit_comic(comic_id)) with check (comic_id is not null and public.can_edit_comic(comic_id));
drop policy if exists "comic editors" on videos;
create policy "comic editors" on videos for all to authenticated
  using (comic_id is not null and public.can_edit_comic(comic_id)) with check (comic_id is not null and public.can_edit_comic(comic_id));

/* ---------------- hiding a comic's date or video on one site ---------------- */
create table if not exists site_hidden (
  site_id text not null references sites(id) on delete cascade,
  kind text not null check (kind in ('show', 'video')),
  item_id uuid not null,
  primary key (site_id, kind, item_id)
);
alter table site_hidden enable row level security;
drop policy if exists "public read" on site_hidden;
create policy "public read" on site_hidden for select using (true);
drop policy if exists "site admin manage" on site_hidden;
create policy "site admin manage" on site_hidden for all to authenticated using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id));
grant select on site_hidden to anon, authenticated;
grant insert, delete on site_hidden to authenticated;

/* ---------------- what each site shows ---------------- */
-- A site's shows: every date of every comic in its lineup, plus its own show events.
-- "host" comes back as that comic's id on this site, so pages and filters work the same everywhere.
create or replace function public.site_shows(p_site text, p_all boolean default false)
returns setof jsonb language sql stable set search_path = public as $$
  -- site_id stays the site it was added on; lineup stays comic ids, lineup_hosts is the same people on this site
  select to_jsonb(s) || jsonb_build_object(
      'host', h.id,
      'event', s.comic_id is null,
      'lineup_hosts', (select coalesce(jsonb_agg(h2.id order by h2.sort), '[]'::jsonb) from hosts h2 where h2.site_id = p_site and h2.comic_id = any (s.lineup)),
      'hidden_here', exists (select 1 from site_hidden x where x.site_id = p_site and x.kind = 'show' and x.item_id = s.id) or coalesce(h.hidden, false))
  from shows s
  left join hosts h on h.site_id = p_site and h.comic_id = s.comic_id
  where ((s.comic_id is not null and h.id is not null) or (s.comic_id is null and s.site_id = p_site))
    and (p_all or s.date >= current_date)
    and (p_all or not (exists (select 1 from site_hidden x where x.site_id = p_site and x.kind = 'show' and x.item_id = s.id) or coalesce(h.hidden, false)))
  order by s.date, s.time;
$$;
grant execute on function public.site_shows(text, boolean) to anon, authenticated;

-- A site's videos: its own channels, plus the channels of comics in its lineup.
create or replace function public.site_videos(p_site text, p_all boolean default false)
returns setof jsonb language sql stable set search_path = public as $$
  select to_jsonb(v) || jsonb_build_object(
      'host', h.id,
      'hidden_here', (v.site_id = p_site and v.hidden) or exists (select 1 from site_hidden x where x.site_id = p_site and x.kind = 'video' and x.item_id = v.id))
  from videos v
  left join hosts h on h.site_id = p_site and h.comic_id = v.comic_id
  where (v.site_id = p_site or (v.comic_id is not null and h.id is not null and not h.hidden))
    and (p_all or not ((v.site_id = p_site and v.hidden) or exists (select 1 from site_hidden x where x.site_id = p_site and x.kind = 'video' and x.item_id = v.id)))
  order by v.published desc nulls last
  limit case when p_all then 2000 else 200 end;
$$;
grant execute on function public.site_videos(text, boolean) to anon, authenticated;

/* ---------------- fan list follows the new shows ---------------- */
create or replace function public.fans_near_shows(p_site text)
returns table (show_id uuid, fans int) language sql stable security invoker set search_path = public as $$
  select (r->>'id')::uuid, count(f.id)::int
  from public.site_shows(p_site) r
  join venues v on v.id = (r->>'venue_id')::uuid
  left join fans f on f.site_id = p_site and f.lat is not null and v.lat is not null
    and public.miles(f.lat, f.lng, v.lat, v.lng) <= f.radius_mi
  group by 1;
$$;
-- The fans of one site who are near one show (only that site's admins get anything back).
drop function if exists public.fans_near_show(uuid);
create or replace function public.fans_near_show(p_show uuid, p_site text)
returns setof fans language sql stable security invoker set search_path = public as $$
  select f.* from shows s join venues v on v.id = s.venue_id
  join fans f on f.site_id = p_site and f.lat is not null and v.lat is not null and public.miles(f.lat, f.lng, v.lat, v.lng) <= f.radius_mi
  where s.id = p_show
    and (s.site_id = p_site or exists (select 1 from hosts h where h.site_id = p_site and h.comic_id = s.comic_id))
  order by f.created_at;
$$;
grant execute on function public.fans_near_show(uuid, text) to authenticated;
