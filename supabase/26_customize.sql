-- Everything is free for now (founder, Oct 29): every comic gets every customization, Custom colors included.
-- Only ComicTable admins still switch Pro on or off (it unlocks nothing yet).
-- The Coaster's settings grew (the page around it, lettering, doodles, templates, the QR code), so it gets more room.
-- Run once in Supabase → SQL Editor, after 25_foundation.sql. Safe to run again.

create or replace function public.coaster_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.pro is distinct from (case when tg_op = 'UPDATE' then old.pro else false end) and not public.is_platform_owner() then
    raise exception 'Only ComicTable admins can change Pro.' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'comics_coaster_check' and pg_get_constraintdef(oid) like '%4000%') then
    alter table comics drop constraint comics_coaster_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comics_coaster_check') then
    alter table comics add constraint comics_coaster_check check (
      look in ('classic', 'night', 'redwood', 'mustard', 'checker', 'pop', 'spooky', 'holiday', 'custom')
      and (tape_url is null or (tape_url ~* '^https://' and char_length(tape_url) <= 500))
      and char_length(coalesce(tape_title, '')) <= 120
      and jsonb_typeof(coaster) = 'object' and length(coaster::text) <= 8000);
  end if;
end $$;
