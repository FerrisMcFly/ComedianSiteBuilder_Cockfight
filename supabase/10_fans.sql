-- Fan list: fans sign up on a comic's site with their email and city, and the comic can see
-- who lives near each show. The list belongs to that comic's site; nobody else can read it.
-- Run once in Supabase → SQL Editor, after 09_places.sql. Safe to run again.

-- Clubs get a map position from their city, so we can measure distance to fans.
alter table venues add column if not exists lat double precision;
alter table venues add column if not exists lng double precision;

create or replace function public.locate_venue() returns trigger language plpgsql set search_path = public as $$
declare p record;
begin
  if new.lat is null or tg_op = 'INSERT' or new.city is distinct from old.city or new.state is distinct from old.state then
    select lat, lng into p from places
      where lower(name) = lower(trim(new.city)) and (new.state is null or state is null or upper(state) = upper(new.state))
      order by (upper(coalesce(state, '')) = upper(coalesce(new.state, ''))) desc, population desc limit 1;
    new.lat := p.lat; new.lng := p.lng;
  end if;
  return new;
end $$;
drop trigger if exists venues_locate on venues;
create trigger venues_locate before insert or update of city, state on venues for each row execute function public.locate_venue();
update venues set city = city where lat is null;  -- fill in the clubs we already have

-- Miles between two points
create or replace function public.miles(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 3958.8 * 2 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

create table if not exists fans (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references sites(id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  place_id bigint references places(id) on delete set null,
  city text,
  state text,
  lat double precision,
  lng double precision,
  radius_mi int not null default 50 check (radius_mi in (25, 50, 100, 250)),
  token uuid not null default gen_random_uuid() unique,  -- for a one-click "stop emailing me" link
  created_at timestamptz not null default now()
);
create unique index if not exists fans_site_email on fans (site_id, lower(email));
alter table fans enable row level security;
drop policy if exists "site admins read fans" on fans;
create policy "site admins read fans" on fans for select to authenticated using (public.is_site_admin(site_id));
drop policy if exists "site admins remove fans" on fans;
create policy "site admins remove fans" on fans for delete to authenticated using (public.is_site_admin(site_id));
grant select, delete on fans to authenticated;

-- Fans join through this, so nobody can read the list or sign someone up to another site's list.
create or replace function public.join_fans(p_site text, p_email text, p_place bigint, p_radius int default 50)
returns text language plpgsql security definer set search_path = public as $$
declare p record; e text := lower(trim(p_email)); existed boolean;
begin
  if not exists (select 1 from sites where id = p_site and coalesce((features->>'fans')::boolean, false)) then
    raise exception 'This site isn''t taking sign-ups right now.' using errcode = 'P0001';
  end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 200 then
    raise exception 'That email doesn''t look right.' using errcode = 'P0001';
  end if;
  select * into p from places where id = p_place;
  if not found then raise exception 'Pick your city from the list.' using errcode = 'P0001'; end if;
  existed := exists (select 1 from fans where site_id = p_site and lower(email) = e);
  insert into fans (site_id, email, place_id, city, state, lat, lng, radius_mi)
    values (p_site, e, p.id, p.name, p.state, p.lat, p.lng, case when p_radius in (25, 50, 100, 250) then p_radius else 50 end)
  on conflict (site_id, lower(email)) do update set place_id = excluded.place_id, city = excluded.city, state = excluded.state,
    lat = excluded.lat, lng = excluded.lng, radius_mi = excluded.radius_mi;
  return case when existed then 'updated' else 'joined' end;
end $$;
revoke all on function public.join_fans(text, text, bigint, int) from public;
grant execute on function public.join_fans(text, text, bigint, int) to anon, authenticated;

create or replace function public.leave_fans(p_token uuid) returns boolean
language sql security definer set search_path = public as $$
  with gone as (delete from fans where token = p_token returning 1) select exists (select 1 from gone);
$$;
revoke all on function public.leave_fans(uuid) from public;
grant execute on function public.leave_fans(uuid) to anon, authenticated;

-- For the admin: each upcoming show and how many fans live within their chosen distance of it.
create or replace function public.fans_near_shows(p_site text)
returns table (show_id uuid, fans int) language sql stable security invoker set search_path = public as $$
  select s.id, count(f.id)::int
  from shows s join venues v on v.id = s.venue_id
  left join fans f on f.site_id = s.site_id and f.lat is not null and v.lat is not null
    and public.miles(f.lat, f.lng, v.lat, v.lng) <= f.radius_mi
  where s.site_id = p_site and s.date >= current_date
  group by s.id;
$$;
grant execute on function public.fans_near_shows(text) to authenticated;

-- For the admin: the fans near one show (only works for that site's admins, because of the fans rules above)
create or replace function public.fans_near_show(p_show uuid)
returns setof fans language sql stable security invoker set search_path = public as $$
  select f.* from shows s join venues v on v.id = s.venue_id
  join fans f on f.site_id = s.site_id and f.lat is not null and v.lat is not null and public.miles(f.lat, f.lng, v.lat, v.lng) <= f.radius_mi
  where s.id = p_show order by f.created_at;
$$;
grant execute on function public.fans_near_show(uuid) to authenticated;
