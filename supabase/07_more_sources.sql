-- Multiple podcasts and YouTube channels per site, and channels that belong to a person.
-- Run once in Supabase → SQL Editor. Safe to run again.

alter table sources add column if not exists host text references hosts(id) on delete set null;   -- whose channel (null = the show's)
alter table videos add column if not exists source_id uuid references sources(id) on delete set null;
alter table videos add column if not exists channel text;                                           -- the channel's name, for labels and filters
alter table videos add column if not exists host text references hosts(id) on delete set null;     -- shows the video on that person's page
alter table episodes add column if not exists source_id uuid references sources(id) on delete set null;
alter table episodes add column if not exists show_name text;                                       -- which podcast, when a site has more than one
create index if not exists videos_host_idx on videos (site_id, host);
