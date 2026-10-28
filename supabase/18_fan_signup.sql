-- Quick fan sign-up (the QR code page): fans can say where they met the comic, and the list
-- remembers how each fan joined (on the site, from a QR code, or from an embed).
-- Run once in Supabase → SQL Editor, after 17_press_kit.sql. Safe to run again.

alter table fans add column if not exists met_at text;
alter table fans add column if not exists source text not null default 'site';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fans_met_at_len') then
    alter table fans add constraint fans_met_at_len check (met_at is null or char_length(met_at) <= 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fans_source_kind') then
    alter table fans add constraint fans_source_kind check (source in ('site', 'qr', 'embed'));
  end if;
end $$;

-- Same as before, plus two optional answers. Existing sites keep calling it with four.
drop function if exists public.join_fans(text, text, bigint, int);
create or replace function public.join_fans(p_site text, p_email text, p_place bigint, p_radius int default 50, p_met text default null, p_source text default 'site')
returns text language plpgsql security definer set search_path = public as $$
declare p record; e text := lower(trim(p_email)); existed boolean;
  m text := nullif(left(trim(coalesce(p_met, '')), 200), '');
  src text := case when p_source in ('site', 'qr', 'embed') then p_source else 'site' end;
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
  insert into fans (site_id, email, place_id, city, state, lat, lng, radius_mi, met_at, source)
    values (p_site, e, p.id, p.name, p.state, p.lat, p.lng, case when p_radius in (25, 50, 100, 250) then p_radius else 50 end, m, src)
  on conflict (site_id, lower(email)) do update set place_id = excluded.place_id, city = excluded.city, state = excluded.state,
    lat = excluded.lat, lng = excluded.lng, radius_mi = excluded.radius_mi,
    met_at = coalesce(excluded.met_at, fans.met_at);  -- signing up again never wipes where you met
  return case when existed then 'updated' else 'joined' end;
end $$;
revoke all on function public.join_fans(text, text, bigint, int, text, text) from public;
grant execute on function public.join_fans(text, text, bigint, int, text, text) to anon, authenticated;
