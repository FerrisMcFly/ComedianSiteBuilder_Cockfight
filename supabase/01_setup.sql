-- Cockfight site database. Paste into Supabase → SQL Editor → New query → Run. Run it once.

-- ===== Who counts as an admin =====
create table admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table admins enable row level security;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ===== Site content =====
create table hosts (
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
  sort int default 0
);

create table shows (
  id uuid primary key default gen_random_uuid(),
  host text not null references hosts(id) on delete cascade,
  date date not null,
  time text,
  city text,
  venue text,
  url text
);

create table episodes (
  id uuid primary key default gen_random_uuid(),
  num int not null,
  title text not null,
  posted date not null,
  length text,
  url text,
  patreon text check (patreon in ('p1', 'p2')),
  blurb text
);

create table settings (key text primary key, value text);

-- Everyone can read content; only admins can change it.
do $$
declare t text;
begin
  foreach t in array array['hosts', 'shows', 'episodes', 'settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "public read" on %I for select using (true)', t);
    execute format('create policy "admin write" on %I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ===== Forum =====
create table threads (
  id uuid primary key default gen_random_uuid(),
  board text not null check (board in ('general', 'episodes', 'tour', 'cantina')),
  title text not null check (char_length(title) between 1 and 90),
  author text not null check (char_length(author) between 1 and 24),
  created_at bigint not null,
  last_at bigint not null,
  last_by text,
  replies int not null default 0
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,
  author text not null check (char_length(author) between 1 and 24),
  body text not null check (char_length(body) between 1 and 4000),
  created_at bigint not null
);

-- Keep each topic's last post and reply count up to date
create function bump_thread() returns trigger language plpgsql security definer set search_path = public as $$
declare tid uuid := coalesce(new.thread_id, old.thread_id);
begin
  update threads t set
    replies = greatest((select count(*) from posts where thread_id = tid) - 1, 0),
    last_at = coalesce((select max(created_at) from posts where thread_id = tid), t.created_at),
    last_by = coalesce((select author from posts where thread_id = tid order by created_at desc limit 1), t.author)
  where t.id = tid;
  return null;
end $$;
create trigger posts_bump after insert or delete on posts for each row execute function bump_thread();

alter table threads enable row level security;
alter table posts enable row level security;
create policy "public read" on threads for select using (true);
create policy "anyone posts" on threads for insert with check (replies = 0);
create policy "admin delete" on threads for delete to authenticated using (public.is_admin());
create policy "public read" on posts for select using (true);
create policy "anyone replies" on posts for insert with check (true);
create policy "admin delete" on posts for delete to authenticated using (public.is_admin());

-- ===== Photo uploads =====
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);
create policy "admin upload photos" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.is_admin());
create policy "admin update photos" on storage.objects for update to authenticated using (bucket_id = 'photos' and public.is_admin());
create policy "admin delete photos" on storage.objects for delete to authenticated using (bucket_id = 'photos' and public.is_admin());
