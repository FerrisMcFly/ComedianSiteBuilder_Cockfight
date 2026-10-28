-- "Me": a comic with their own login sees all their dates across every site they're on.
-- Run once in Supabase → SQL Editor, after 12_show_finder.sql. Safe to run again.

-- Every upcoming date for one comic: their solo dates, plus show events they're in, with the site's name.
create or replace function public.comic_shows(p_comic text)
returns setof jsonb language sql stable set search_path = public as $$
  select to_jsonb(s) || jsonb_build_object('site_name', st.name, 'event', s.comic_id is null)
  from shows s join sites st on st.id = s.site_id
  where (s.comic_id = p_comic or p_comic = any (s.lineup)) and s.date >= current_date
  order by s.date, s.time;
$$;
grant execute on function public.comic_shows(text) to anon, authenticated;

create index if not exists comics_user on comics (user_id);
