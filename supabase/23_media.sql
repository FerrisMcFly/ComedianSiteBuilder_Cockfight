-- Media and streaming: Spotify links for episodes, which videos are YouTube Shorts, and going live.
-- Run once in Supabase → SQL Editor, after 22_news.sql. Safe to run again.

-- An episode's Spotify page. Filled in by the hourly import once Spotify keys are in Netlify
-- (SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET) and the site has its Spotify show link; or typed in.
alter table episodes add column if not exists spotify_url text;

-- YouTube Shorts: the import marks them from the channel's Shorts-only list, so sites can show them in their own strip.
alter table videos add column if not exists is_short boolean not null default false;

-- Live right now: { "url": "https://twitch.tv/…", "title": "…", "started_at": "…" }, or empty when not live.
-- The site's team sets it with "Go live" in the dashboard and clears it with "End". Sites stop showing LIVE
-- on their own after 12 hours, in case someone forgets to end it.
alter table sites add column if not exists live jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sites_live_check') then
    alter table sites add constraint sites_live_check check (live is null or (jsonb_typeof(live) = 'object' and length(live::text) <= 1000));
  end if;
end $$;
