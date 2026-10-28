-- More social links: Threads, Bluesky, Facebook, Twitch, Kick, Snapchat, Spotify, Apple Podcasts,
-- SoundCloud, Substack and Cameo, on top of Instagram, YouTube, TikTok, X and website.
-- Like the others they belong to the comic and show on every site they're on.
-- Stored as one JSON object ({ "threads": "https://…", … }) so adding a platform later needs no database change.
-- Run once in Supabase → SQL Editor, after 18_fan_signup.sql. Safe to run again.

alter table comics add column if not exists socials jsonb not null default '{}'::jsonb;
alter table hosts add column if not exists socials jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comics_socials_size') then
    alter table comics add constraint comics_socials_size check (jsonb_typeof(socials) = 'object' and length(socials::text) <= 4000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hosts_socials_size') then
    alter table hosts add constraint hosts_socials_size check (jsonb_typeof(socials) = 'object' and length(socials::text) <= 4000);
  end if;
end $$;

-- Same two sync functions as 11_comics.sql, now copying the new links too.
create or replace function public.comic_to_hosts() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update hosts set name = new.name, status = new.status, photo_url = new.photo_url, instagram = new.instagram, youtube = new.youtube,
    tiktok = new.tiktok, twitter = new.twitter, website = new.website, socials = coalesce(new.socials, '{}'::jsonb),
    bio = case when own_bio then bio else new.bio end, title = case when own_title then title else new.title end
  where comic_id = new.id;
  return new;
end $$;

create or replace function public.host_from_comic() returns trigger language plpgsql set search_path = public as $$
declare c record;
begin
  if new.comic_id is null then return new; end if;
  select * into c from comics where id = new.comic_id;
  if not found then return new; end if;
  new.name := c.name; new.status := c.status; new.photo_url := c.photo_url; new.instagram := c.instagram; new.youtube := c.youtube;
  new.tiktok := c.tiktok; new.twitter := c.twitter; new.website := c.website; new.socials := coalesce(c.socials, '{}'::jsonb);
  if not new.own_bio then new.bio := c.bio; end if;
  if not new.own_title then new.title := c.title; end if;
  return new;
end $$;
