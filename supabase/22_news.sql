-- Home screen = News + Links.
-- News is one list of things a comic pins for now: a show, a video, a special, an announcement. Each shows as a
-- big card, a scrolling banner or a small strip, from a start date until an end date. Links stay their own list
-- (permanent buttons). This takes over from Announcements: every announcement moves into News as a banner,
-- once (re-running this is safe). The old announcements table stays until after the big ship; nothing edits it.
-- Run once in Supabase → SQL Editor, after 21_coasters.sql. Safe to run again.

alter table home_picks add column if not exists style text not null default 'card';
alter table home_picks add column if not exists starts_on date;
alter table home_picks add column if not exists from_announcement uuid;  -- the announcement it came from, if any
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'home_picks_style_check') then
    alter table home_picks add constraint home_picks_style_check check (style in ('card', 'banner', 'strip'));
  end if;
end $$;
create unique index if not exists home_picks_from_announcement on home_picks (from_announcement) where from_announcement is not null;

-- Announcements move into News as banners (pinned ones first), keeping their dates and links.
insert into home_picks (site_id, kind, style, headline, body, button_label, link, starts_on, ends_on, sort, from_announcement)
select a.site_id, 'announcement', 'banner',
  case when char_length(a.text) <= 90 then a.text else left(a.text, 89) || '…' end,
  case when char_length(a.text) > 90 then left(a.text, 300) end,
  left(nullif(a.link_label, ''), 30), left(nullif(a.link, ''), 500), a.starts_on, a.ends_on,
  case when a.pinned then -100 + coalesce(a.sort, 0) else 100 + coalesce(a.sort, 0) end,
  a.id
from announcements a
where coalesce(trim(a.text), '') <> ''
  and not exists (select 1 from home_picks p where p.from_announcement = a.id);
