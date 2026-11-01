-- Ticket taps (Step 5, item 47): every Tickets button on a comic's site, Coaster or embed goes through
-- comictable.com/go/<show>, which counts the tap and sends the fan on to the ticket page. The dashboard shows the
-- counts on each show and on the comic's Dashboard. Only counts are stored: no names, emails or IP addresses.
-- Taps are written by the go function with the service key; nobody writes them from the outside.
-- Run once in Supabase → SQL Editor, after 27_invites.sql (then 99_rules.sql). Safe to run again.

create table if not exists ticket_taps (
  id bigint generated always as identity primary key,
  show_id uuid not null references shows(id) on delete cascade,
  site_id text references sites(id) on delete set null,     -- the site the tap came from, if any
  comic_id text references comics(id) on delete set null,   -- whose show it was
  source text not null default 'site' check (source in ('site', 'coaster', 'embed', 'other')),
  created_at timestamptz not null default now()
);
create index if not exists ticket_taps_show on ticket_taps (show_id);
create index if not exists ticket_taps_comic on ticket_taps (comic_id, created_at);
alter table ticket_taps enable row level security;
revoke all on ticket_taps from anon, authenticated;

-- Taps per show, for the shows you can see in the dashboard: your own (or a Coaster you help with), a site you
-- book for, or every show for ComicTable staff. week: the last 7 days.
create or replace function public.ticket_tap_counts(p_shows uuid[])
returns table (show_id uuid, taps bigint, week bigint) language plpgsql stable security definer set search_path = public as $$
begin
  return query select t.show_id, count(*)::bigint, count(*) filter (where t.created_at > now() - interval '7 days')::bigint
  from ticket_taps t join shows s on s.id = t.show_id
  where t.show_id = any(p_shows)
    and (public.is_platform_admin() or (s.comic_id is not null and public.can_edit_comic(s.comic_id)) or (s.site_id is not null and public.can_site(s.site_id, 'shows')))
  group by t.show_id;
end $$;
revoke all on function public.ticket_tap_counts(uuid[]) from public;
grant execute on function public.ticket_tap_counts(uuid[]) to authenticated;

-- A comic's taps over the last 30 days, for their Dashboard.
create or replace function public.ticket_taps_30d(p_comic text)
returns bigint language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_platform_admin() or public.can_edit_comic(p_comic)) then return 0; end if;
  return (select count(*) from ticket_taps where comic_id = p_comic and created_at > now() - interval '30 days');
end $$;
revoke all on function public.ticket_taps_30d(text) from public;
grant execute on function public.ticket_taps_30d(text) to authenticated;
