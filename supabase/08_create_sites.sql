-- Lets platform admins (you) create a new comic's site from the admin, in one step, and gives
-- platform admins full access to every site. Run once in Supabase → SQL Editor. Safe to run again.

-- Each site's team can manage only that site. Platform admins (ComicTable's super admins) can manage all of them.
create or replace function public.is_site_admin(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and site_id = sid)
      or exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- Who the super admins are, for the admin's All sites page (only super admins can see this)
drop function if exists public.platform_admin_list();  -- (21_roles.sql adds a role column to it)
create or replace function public.platform_admin_list()
returns table (user_id uuid, email text, you boolean) language sql stable security definer set search_path = public as $$
  select p.user_id, u.email::text, p.user_id = auth.uid()
  from platform_admins p join auth.users u on u.id = p.user_id
  where exists (select 1 from platform_admins where user_id = auth.uid())
  order by u.email;
$$;
revoke all on function public.platform_admin_list() from public;
grant execute on function public.platform_admin_list() to authenticated;

create or replace function public.remove_platform_admin(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from platform_admins where user_id = auth.uid()) then
    raise exception 'Only super admins can do that.' using errcode = 'P0001';
  end if;
  if p_user = auth.uid() then
    raise exception 'You can''t remove yourself.' using errcode = 'P0001';
  end if;
  delete from platform_admins where user_id = p_user;
end $$;
revoke all on function public.remove_platform_admin(uuid) from public;
grant execute on function public.remove_platform_admin(uuid) to authenticated;

create or replace function public.create_site(p_id text, p_name text, p_domain text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only ComicTable platform admins can create sites.' using errcode = 'P0001';
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
  -- No team row for you: platform admins can already manage every site (see is_site_admin below),
  -- and staying off the team keeps you out of the comic's team list.
  insert into boards (site_id, id, name, description, sort) values
    (p_id, 'general', 'General', 'Talk about anything', 0),
    (p_id, 'shows', 'Live Shows', 'Going to a show? Saw one? Post here', 1),
    (p_id, 'episodes', 'Episodes', 'Talk about the latest episodes', 2);
end $$;
revoke all on function public.create_site(text, text, text) from public;
grant execute on function public.create_site(text, text, text) to authenticated;

-- Platform admins can edit any site's settings (name, domain, sections), not just their own
drop policy if exists "platform admins edit sites" on sites;
create policy "platform admins edit sites" on sites for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- "Get your site" requests from the comictable.com front page.
-- Anyone can send one; only platform admins can read them.
create table if not exists site_requests (
  id bigint generated always as identity primary key,
  name text not null check (length(name) between 1 and 120),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  act text check (length(act) <= 200),
  links text check (length(links) <= 1000),
  note text check (length(note) <= 2000),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table site_requests enable row level security;
drop policy if exists "anyone can ask" on site_requests;
create policy "anyone can ask" on site_requests for insert to anon, authenticated with check (handled = false);
drop policy if exists "platform admins read" on site_requests;
create policy "platform admins read" on site_requests for select to authenticated using (public.is_platform_admin());
drop policy if exists "platform admins update" on site_requests;
create policy "platform admins update" on site_requests for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists "platform admins delete" on site_requests;
create policy "platform admins delete" on site_requests for delete to authenticated using (public.is_platform_admin());
grant insert on site_requests to anon, authenticated;
grant select, update, delete on site_requests to authenticated;
