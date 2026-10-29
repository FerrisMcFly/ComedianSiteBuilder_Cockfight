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

/* ---------------- keeping every site in step with a comic's Coaster ---------------- */
-- A site's copy of a comic (hosts) follows the comic, except a bio, title or photo the site set for itself.
-- These lived in 11_comics and 19_more_socials; they're here so an older upgrade can't bring back an old copy.
alter table comics add column if not exists socials jsonb not null default '{}'::jsonb;
alter table hosts add column if not exists socials jsonb not null default '{}'::jsonb;
alter table hosts add column if not exists own_photo boolean not null default false;

create or replace function public.comic_to_hosts() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update hosts set name = new.name, status = new.status, instagram = new.instagram, youtube = new.youtube,
    tiktok = new.tiktok, twitter = new.twitter, website = new.website, socials = coalesce(new.socials, '{}'::jsonb),
    photo_url = case when own_photo then photo_url else new.photo_url end,
    bio = case when own_bio then bio else new.bio end, title = case when own_title then title else new.title end
  where comic_id = new.id;
  return new;
end $$;
drop trigger if exists comics_sync on comics;
create trigger comics_sync after update on comics for each row execute function public.comic_to_hosts();

create or replace function public.host_from_comic() returns trigger language plpgsql set search_path = public as $$
declare c record;
begin
  if new.comic_id is null then return new; end if;
  select * into c from comics where id = new.comic_id;
  if not found then return new; end if;
  new.name := c.name; new.status := c.status; new.instagram := c.instagram; new.youtube := c.youtube;
  new.tiktok := c.tiktok; new.twitter := c.twitter; new.website := c.website; new.socials := coalesce(c.socials, '{}'::jsonb);
  if not new.own_photo then new.photo_url := c.photo_url; end if;
  if not new.own_bio then new.bio := c.bio; end if;
  if not new.own_title then new.title := c.title; end if;
  return new;
end $$;
drop trigger if exists hosts_from_comic on hosts;
create trigger hosts_from_comic before insert or update of comic_id, own_bio, own_title, own_photo on hosts
  for each row execute function public.host_from_comic();

/* ---------------- putting a comic with their own login on a site ---------------- */
-- A comic who has claimed their Coaster (has a login) says yes before a site can add them.
-- No ask needed: the comic adding themselves, ComicTable admins, and the server (no login).
do $$ begin
  if to_regclass('public.coaster_requests') is not null then
    execute 'drop policy if exists "see requests" on coaster_requests';
    execute $p$create policy "see requests" on coaster_requests for select to authenticated using (
      requested_by = auth.uid() or public.is_site_admin(site_id) or public.is_platform_admin()
      or exists (select 1 from comics c where c.id = comic_id and c.user_id = auth.uid()))$p$;
    execute 'drop policy if exists "ask" on coaster_requests';
    execute $p$create policy "ask" on coaster_requests for insert to authenticated with check (
      requested_by = auth.uid() and status = 'pending' and public.is_site_admin(site_id))$p$;
    execute 'drop policy if exists "take back" on coaster_requests';
    execute $p$create policy "take back" on coaster_requests for delete to authenticated using (
      status = 'pending' and (requested_by = auth.uid() or public.is_site_admin(site_id)))$p$;
  end if;
end $$;

create or replace function public.host_needs_ok() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if new.comic_id is null or auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.comic_id is not distinct from old.comic_id then return new; end if;
  select user_id into owner from comics where id = new.comic_id;
  if owner is null or owner = auth.uid() or public.is_platform_owner() then return new; end if;
  if to_regclass('public.coaster_requests') is not null and exists (
       select 1 from coaster_requests where comic_id = new.comic_id and site_id = new.site_id and status = 'approved') then
    return new;
  end if;
  raise exception 'This comic has their own login. Ask them first: they''ll get a request to say yes.' using errcode = 'P0001';
end $$;
drop trigger if exists hosts_needs_ok on hosts;
create trigger hosts_needs_ok before insert or update of comic_id on hosts for each row execute function public.host_needs_ok();

-- The comic (or a ComicTable admin) answers. Yes puts them on the site, at the end of its lineup.
create or replace function public.answer_coaster_request(p_id uuid, p_yes boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r record; c record; hid text; n int := 0;
begin
  select * into r from coaster_requests where id = p_id and status = 'pending';
  if not found then raise exception 'That request was already answered.' using errcode = 'P0001'; end if;
  select * into c from comics where id = r.comic_id;
  if not (c.user_id = auth.uid() or public.is_platform_owner()) then
    raise exception 'Only the comic can answer this.' using errcode = '42501';
  end if;
  update coaster_requests set status = case when p_yes then 'approved' else 'declined' end, answered_at = now() where id = p_id;
  if p_yes and not exists (select 1 from hosts where site_id = r.site_id and comic_id = r.comic_id) then
    hid := r.site_id || '-' || coalesce(nullif(public.comic_slug(split_part(c.name, ' ', 1)), 'comic'), 'person');
    while exists (select 1 from hosts where id = hid) loop n := n + 1; hid := hid || '-' || n; end loop;
    insert into hosts (id, site_id, comic_id, name, sort)
      values (hid, r.site_id, r.comic_id, c.name, (select count(*) from hosts where site_id = r.site_id));
  end if;
end $$;
revoke all on function public.answer_coaster_request(uuid, boolean) from public;
grant execute on function public.answer_coaster_request(uuid, boolean) to authenticated;

/* ---------------- forum and chat safety ---------------- */
-- Every fan post (topic, reply, chat message) goes through community_guard. A site's community settings:
--   forum_open, chat_open, slow_mode_seconds (default 30), chat_slow_seconds (default 5), banned_words, reserve_names
--   links_from: "nobody" (default), "approved" (fans a moderator approved) or "everyone"
--   hold_first_posts: a fan's first post waits for a moderator (approving it approves the fan)
-- Plus a cap per fan: 20 forum posts and 60 chat messages an hour.
-- Held and reported posts are hidden from the public until a moderator keeps or removes them.
alter table threads add column if not exists held boolean not null default false;
alter table threads add column if not exists reviewed boolean not null default false;
alter table posts add column if not exists held boolean not null default false;
alter table posts add column if not exists reviewed boolean not null default false;
alter table chat_messages add column if not exists held boolean not null default false;
alter table chat_messages add column if not exists reviewed boolean not null default false;

-- Does a post have a link in it? (an address, or something.com)
create or replace function public.has_link(t text) returns boolean language sql immutable as $$
  select coalesce(t, '') ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|gg|ly|tv|co|me|xyz|app|link|info|biz|us|uk|ca|club|live|site|online|shop)(\M|/))';
$$;

-- A fan a moderator approved (by name or by device).
create or replace function public.is_trusted(p_site text, p_author text, p_device text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  if to_regclass('public.trusted') is null then return false; end if;
  execute 'select exists (select 1 from trusted where site_id = $1 and ((author is not null and lower(author) = lower($2)) or (device is not null and device = $3)))'
    into ok using p_site, p_author, p_device;
  return ok;
end $$;

create or replace function public.community_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c jsonb;
  admin_ok boolean := public.can_site(new.site_id, 'community');
  wait_s int;
  txt text;
  w text;
  b record;
  links text;
  recent int;
begin
  new.author := trim(new.author);
  if admin_ok then new.held := false; return new; end if;
  new.is_mod := false;            -- only the site's team gets the host badge
  new.held := false; new.reviewed := false;

  select community into c from sites where id = new.site_id;
  c := coalesce(c, '{}'::jsonb);

  if tg_table_name = 'chat_messages' then
    if coalesce((c->>'chat_open')::boolean, true) = false then raise exception 'The chat is closed right now.' using errcode = 'P0001'; end if;
    wait_s := coalesce((c->>'chat_slow_seconds')::int, 5);
    txt := new.body;
  else
    if coalesce((c->>'forum_open')::boolean, true) = false then raise exception 'The forum is closed for posting right now.' using errcode = 'P0001'; end if;
    wait_s := coalesce((c->>'slow_mode_seconds')::int, 30);
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

  -- links: nobody (the default), approved fans only, or everyone
  links := coalesce(c->>'links_from', 'nobody');
  if links <> 'everyone' and public.has_link(txt) and not (links = 'approved' and public.is_trusted(new.site_id, new.author, new.device)) then
    raise exception '%', case when links = 'approved' then 'Links are only for approved fans here. Post it without the link.' else 'Links aren''t allowed here. Post it without the link.' end using errcode = 'P0001';
  end if;

  -- slow mode (per device, falling back to per name), then an hourly cap
  if tg_table_name = 'chat_messages' then
    if wait_s > 0 and exists (select 1 from chat_messages m where m.site_id = new.site_id
                 and ((new.device is not null and m.device = new.device) or lower(m.author) = lower(new.author))
                 and m.created_at > now() - make_interval(secs => wait_s)) then
      raise exception 'Slow down! Wait a few seconds between messages.' using errcode = 'P0001'; end if;
    select count(*) into recent from chat_messages m where m.site_id = new.site_id
      and ((new.device is not null and m.device = new.device) or lower(m.author) = lower(new.author)) and m.created_at > now() - interval '1 hour';
    if recent >= 60 then raise exception 'That''s a lot of messages. Take a breather and come back in a bit.' using errcode = 'P0001'; end if;
  elsif tg_table_name = 'posts' then
    if wait_s > 0 and exists (select 1 from posts p where p.site_id = new.site_id
                 and ((new.device is not null and p.device = new.device) or lower(p.author) = lower(new.author))
                 and p.created_at > (extract(epoch from now()) * 1000 - wait_s * 1000)) then
      raise exception 'Slow down! Wait a little before posting again.' using errcode = 'P0001'; end if;
    select count(*) into recent from posts p where p.site_id = new.site_id
      and ((new.device is not null and p.device = new.device) or lower(p.author) = lower(new.author)) and p.created_at > (extract(epoch from now()) * 1000 - 3600000);
    if recent >= 20 then raise exception 'That''s a lot of posts for one hour. Come back in a bit.' using errcode = 'P0001'; end if;
  end if;

  -- first posts wait for a moderator (when the site turned that on); a held topic holds its first post too
  if tg_table_name = 'posts' then
    if exists (select 1 from threads where id = new.thread_id and held) then new.held := true; return new; end if;
  end if;
  if coalesce((c->>'hold_first_posts')::boolean, false) and not public.is_trusted(new.site_id, new.author, new.device) then
    if tg_table_name = 'chat_messages' then
      new.held := not exists (select 1 from chat_messages m where m.site_id = new.site_id and not m.held and not m.deleted
                               and ((new.device is not null and m.device = new.device) or lower(m.author) = lower(new.author)));
    else
      new.held := not exists (select 1 from posts p where p.site_id = new.site_id and not p.held
                               and ((new.device is not null and p.device = new.device) or lower(p.author) = lower(new.author)));
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

-- The public sees what isn't held (held: waiting for approval, or reported and waiting for a moderator)
drop policy if exists "public read" on threads;
create policy "public read" on threads for select using (not held or public.can_site(site_id, 'community'));
drop policy if exists "public read" on posts;
create policy "public read" on posts for select using (not held or public.can_site(site_id, 'community'));
drop policy if exists "public read" on chat_messages;
create policy "public read" on chat_messages for select using ((not deleted and not held) or public.can_site(site_id, 'community'));

-- Reports: anyone can report; the item is hidden until a moderator keeps it (it can't be hidden again by reports)
-- or removes it. Ten reports an hour per device, one per item.
do $$ begin
  if to_regclass('public.reports') is not null then
    execute 'drop policy if exists "anyone reports" on reports';
    execute 'create policy "anyone reports" on reports for insert with check (status = ''open'')';
    execute 'drop policy if exists "moderators" on reports';
    execute $p$create policy "moderators" on reports for all to authenticated using (public.can_site(site_id, 'community')) with check (public.can_site(site_id, 'community'))$p$;
  end if;
  if to_regclass('public.trusted') is not null then
    execute 'drop policy if exists "moderators" on trusted';
    execute $p$create policy "moderators" on trusted for all to authenticated using (public.can_site(site_id, 'community')) with check (public.can_site(site_id, 'community'))$p$;
  end if;
end $$;
create or replace function public.report_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare tbl text := case new.kind when 'thread' then 'threads' when 'post' then 'posts' else 'chat_messages' end; ok boolean; n int;
begin
  if public.can_site(new.site_id, 'community') then return new; end if;
  new.status := 'open';
  execute format('select exists (select 1 from %I where id::text = $1 and site_id = $2)', tbl) into ok using new.item_id, new.site_id;
  if not ok then raise exception 'That post isn''t here anymore.' using errcode = 'P0001'; end if;
  if new.device is not null then
    select count(*) into n from reports where device = new.device and created_at > now() - interval '1 hour';
    if n >= 10 then raise exception 'That''s a lot of reports. A moderator will look at them soon.' using errcode = 'P0001'; end if;
    if exists (select 1 from reports where device = new.device and kind = new.kind and item_id = new.item_id) then return null; end if;
  end if;
  execute format('update %I set held = true where id::text = $1 and site_id = $2 and not reviewed', tbl) using new.item_id, new.site_id;
  return new;
end $$;
do $$ begin
  if to_regclass('public.reports') is not null then
    execute 'drop trigger if exists reports_guard on reports';
    execute 'create trigger reports_guard before insert on reports for each row execute function public.report_guard()';
  end if;
end $$;
