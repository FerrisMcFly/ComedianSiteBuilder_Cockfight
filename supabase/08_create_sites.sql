-- Lets platform admins (you) create a new comic's site from the admin, in one step.
-- Run once in Supabase → SQL Editor. Safe to run again.

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
  -- whoever creates it starts as its owner, so they can set it up and add the comic to the team
  insert into admins (user_id, site_id, role) values (auth.uid(), p_id, 'owner');
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
