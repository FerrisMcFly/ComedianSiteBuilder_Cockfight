-- ComicTable's access rules: every function and policy that decides who can do what, in one place.
-- This file always runs LAST (it's at the end of every UPGRADE bundle), so re-running an older upgrade
-- can never undo the current rules. Change a rule here, not in the numbered files. Safe to run again.
--
-- Roles
-- ComicTable staff (platform_admins):
--   admin: everything, including staff, creating sites, deleting comics and the comictable.com showcase
--   staff: works on every site and comic, but can't add or remove staff, create sites, delete comics,
--          change what comictable.com shows off, or manage a site's team
-- A site's team (admins):
--   owner: everything on the site, including the team
--   editor: everything but the team
--   shows: dates, ticket links, clubs and the show finder only
--   moderator: forum, chat, bans and the moderation log only

/* ---------------- the roles themselves ---------------- */
alter table platform_admins add column if not exists role text not null default 'admin';
alter table platform_admins drop constraint if exists platform_admins_role_check;
alter table platform_admins add constraint platform_admins_role_check check (role in ('admin', 'staff'));

alter table admins drop constraint if exists admins_role_check;
alter table admins add constraint admins_role_check check (role in ('owner', 'editor', 'shows', 'moderator'));

/* ---------------- who can do what ---------------- */
-- Full access to a site's content: its owners and editors, and all ComicTable staff.
create or replace function public.is_site_admin(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and site_id = sid and role in ('owner', 'editor'))
      or exists (select 1 from platform_admins where user_id = auth.uid());
$$;
-- One part of a site: full access, or the role made for that part.
create or replace function public.can_site(sid text, area text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_site_admin(sid)
      or exists (select 1 from admins where user_id = auth.uid() and site_id = sid
                 and ((area = 'shows' and role = 'shows') or (area = 'community' and role = 'moderator')));
$$;
grant execute on function public.can_site(text, text) to anon, authenticated;
-- ComicTable staff of any kind, and ComicTable admins only.
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;
create or replace function public.is_platform_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid() and role = 'admin');
$$;
grant execute on function public.is_platform_owner() to anon, authenticated;

-- A comic's profile: the comic, ComicTable staff, and owners/editors of any site they're on.
create or replace function public.can_edit_comic(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
      or exists (select 1 from comics where id = c and user_id = auth.uid())
      or exists (select 1 from hosts h join admins a on a.site_id = h.site_id and a.user_id = auth.uid() and a.role in ('owner', 'editor') where h.comic_id = c);
$$;
-- A comic's dates: the same people, plus "shows" people on any site they're on.
create or replace function public.can_edit_comic_dates(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_edit_comic(c)
      or exists (select 1 from hosts h join admins a on a.site_id = h.site_id and a.user_id = auth.uid() and a.role = 'shows' where h.comic_id = c);
$$;
grant execute on function public.can_edit_comic_dates(text) to anon, authenticated;

/* ---------------- shows: owners, editors, staff, and "shows" people ---------------- */
drop policy if exists "site admin write" on shows;
create policy "site admin write" on shows for all to authenticated using (public.can_site(site_id, 'shows')) with check (public.can_site(site_id, 'shows'));
drop policy if exists "comic editors" on shows;
create policy "comic editors" on shows for all to authenticated
  using (comic_id is not null and public.can_edit_comic_dates(comic_id)) with check (comic_id is not null and public.can_edit_comic_dates(comic_id));
drop policy if exists "site admins" on found_shows;
create policy "site admins" on found_shows for all to authenticated using (public.can_site(site_id, 'shows')) with check (public.can_site(site_id, 'shows'));
drop policy if exists "comic editors" on found_shows;
create policy "comic editors" on found_shows for all to authenticated
  using (comic_id is not null and public.can_edit_comic_dates(comic_id)) with check (comic_id is not null and public.can_edit_comic_dates(comic_id));
-- the show finder's links (podcast and YouTube sources stay with owners and editors)
drop policy if exists "shows people manage show sources" on sources;
create policy "shows people manage show sources" on sources for all to authenticated
  using (kind = 'shows' and public.can_site(site_id, 'shows')) with check (kind = 'shows' and public.can_site(site_id, 'shows'));
-- hiding a date on one site
drop policy if exists "site admin manage" on site_hidden;
create policy "site admin manage" on site_hidden for all to authenticated
  using (public.is_site_admin(site_id) or (kind = 'show' and public.can_site(site_id, 'shows')))
  with check (public.is_site_admin(site_id) or (kind = 'show' and public.can_site(site_id, 'shows')));
-- clubs: shows people can add a new (unverified) club for their site and fix the ones they added, like owners and editors
drop policy if exists "site admins add venues" on venues;
drop policy if exists "read venues" on venues;
create policy "read venues" on venues for select using (
  status = 'approved' or public.can_site(created_by_site, 'shows') or public.is_platform_admin());
drop policy if exists "add venues" on venues;
create policy "add venues" on venues for insert to authenticated with check (
  public.is_platform_admin() or (verified = false and public.can_site(created_by_site, 'shows')));
drop policy if exists "edit venues" on venues;
create policy "edit venues" on venues for update to authenticated using (
  public.is_platform_admin() or (verified = false and public.can_site(created_by_site, 'shows')))
  with check (public.is_platform_admin() or (verified = false and public.can_site(created_by_site, 'shows')));

/* ---------------- forum and chat: owners, editors, staff, and moderators ---------------- */
do $$
declare t text;
begin
  foreach t in array array['threads', 'posts', 'bans', 'mod_log', 'chat_messages'] loop
    execute format('drop policy if exists "site admin manage" on %I', t);
    execute format('create policy "site admin manage" on %I for all to authenticated using (public.can_site(site_id, ''community'')) with check (public.can_site(site_id, ''community''))', t);
  end loop;
end $$;
drop policy if exists "public read" on chat_messages;
create policy "public read" on chat_messages for select using (not deleted or public.can_site(site_id, 'community'));

/* ---------------- photos: only into a site you can edit (or your own Coaster's sites) ---------------- */
-- Files live under "<site id>/…". Owners, editors and staff can add or change a site's photos.
-- A comic with their own login can add photos for the sites they're on (their profile photo).
create or replace function public.can_upload_photos(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_site_admin(folder)
      or exists (select 1 from hosts h join comics c on c.id = h.comic_id
                 where h.site_id = folder and c.user_id = auth.uid());
$$;
grant execute on function public.can_upload_photos(text) to authenticated;
drop policy if exists "admin upload photos" on storage.objects;
drop policy if exists "admin update photos" on storage.objects;
drop policy if exists "admin delete photos" on storage.objects;
drop function if exists public.can_upload_photos();  -- the older one from 16_photo_uploads.sql
create policy "admin upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_upload_photos((storage.foldername(name))[1]));
create policy "admin update photos" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.can_upload_photos((storage.foldername(name))[1]));
create policy "admin delete photos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.can_upload_photos((storage.foldername(name))[1]));

/* ---------------- comics: added by owners and editors (any site) or ComicTable staff ---------------- */
drop policy if exists "admins add" on comics;
create policy "admins add" on comics for insert to authenticated
  with check (exists (select 1 from admins where user_id = auth.uid() and role in ('owner', 'editor'))
           or exists (select 1 from platform_admins where user_id = auth.uid()));

/* ---------------- clubs: "Shows only" people can remove an unverified club their site added ---------------- */
drop policy if exists "remove venues" on venues;
create policy "remove venues" on venues for delete to authenticated using (
  public.is_platform_admin() or (verified = false and public.can_site(created_by_site, 'shows')));

/* ---------------- ComicTable admins only ---------------- */
create or replace function public.create_site(p_id text, p_name text, p_domain text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Only ComicTable admins can create sites.' using errcode = 'P0001';
  end if;
  if p_id !~ '^[a-z0-9][a-z0-9-]{1,40}$' then
    raise exception 'A site id uses lowercase letters, numbers and dashes, like "john-smith".' using errcode = 'P0001';
  end if;
  if exists (select 1 from sites where id = p_id) then
    raise exception 'There''s already a site called "%".', p_id using errcode = 'P0001';
  end if;
  insert into sites (id, name, domain, features)
    values (p_id, p_name, nullif(trim(coalesce(p_domain, '')), ''),
            '{"shows": true, "podcast": true, "videos": true, "merch": false, "forum": false, "chat": false}');
  insert into boards (site_id, id, name, description, sort) values
    (p_id, 'general', 'General', 'Talk about anything', 0),
    (p_id, 'shows', 'Live Shows', 'Going to a show? Saw one? Post here', 1),
    (p_id, 'episodes', 'Episodes', 'Talk about the latest episodes', 2);
end $$;

drop function if exists public.platform_admin_list();
create or replace function public.platform_admin_list()
returns table (user_id uuid, email text, role text, you boolean) language sql stable security definer set search_path = public as $$
  select p.user_id, u.email::text, p.role, p.user_id = auth.uid()
  from platform_admins p join auth.users u on u.id = p.user_id
  where exists (select 1 from platform_admins where user_id = auth.uid())
  order by p.role, u.email;
$$;
revoke all on function public.platform_admin_list() from public;
grant execute on function public.platform_admin_list() to authenticated;

create or replace function public.remove_platform_admin(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Only ComicTable admins can do that.' using errcode = 'P0001';
  end if;
  if p_user = auth.uid() then
    raise exception 'You can''t remove yourself.' using errcode = 'P0001';
  end if;
  delete from platform_admins where user_id = p_user;
end $$;

-- Change someone's ComicTable role. There's always at least one admin left.
create or replace function public.set_platform_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Only ComicTable admins can do that.' using errcode = 'P0001';
  end if;
  if p_role not in ('admin', 'staff') then
    raise exception 'Pick admin or staff.' using errcode = 'P0001';
  end if;
  if p_role = 'staff' and not exists (select 1 from platform_admins where role = 'admin' and user_id <> p_user) then
    raise exception 'ComicTable needs at least one admin.' using errcode = 'P0001';
  end if;
  update platform_admins set role = p_role where user_id = p_user;
end $$;
revoke all on function public.set_platform_role(uuid, text) from public;
grant execute on function public.set_platform_role(uuid, text) to authenticated;

drop policy if exists "super admins delete" on comics;
create policy "super admins delete" on comics for delete to authenticated using (public.is_platform_owner());
do $$ begin
  if to_regclass('public.platform_settings') is not null then
    execute 'drop policy if exists "super admins write" on platform_settings';
    execute 'create policy "super admins write" on platform_settings for all to authenticated using (public.is_platform_owner()) with check (public.is_platform_owner())';
  end if;
end $$;
