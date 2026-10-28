-- Blog: a comic writes posts in their dashboard; published ones show on their site.
-- Run once in Supabase → SQL Editor, after 13_me.sql. Safe to run again.

create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references sites(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,80}$'),
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 100000),
  excerpt text check (length(excerpt) <= 500),
  cover_url text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists blog_posts_slug on blog_posts (site_id, slug);
create index if not exists blog_posts_site on blog_posts (site_id, published, published_at desc);
alter table blog_posts enable row level security;
drop policy if exists "public read published" on blog_posts;
create policy "public read published" on blog_posts for select using (published or public.is_site_admin(site_id));
drop policy if exists "site admin write" on blog_posts;
create policy "site admin write" on blog_posts for all to authenticated using (public.is_site_admin(site_id)) with check (public.is_site_admin(site_id));
grant select on blog_posts to anon, authenticated;
grant insert, update, delete on blog_posts to authenticated;

-- Publishing stamps the date once; editing keeps it.
create or replace function public.blog_stamp() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.published and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
drop trigger if exists blog_posts_stamp on blog_posts;
create trigger blog_posts_stamp before insert or update on blog_posts for each row execute function public.blog_stamp();
