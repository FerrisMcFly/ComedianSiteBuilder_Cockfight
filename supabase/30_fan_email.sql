-- Emailing fans (Step 5, item 50): on Fans → "Near your next shows", a comic emails the fans within 50 miles of a
-- show (netlify/functions/fan-email.mjs, sent through Resend). One email per show, at most three a week, and every
-- email has a one-tap unsubscribe (comictable.com/unsub/<token>, netlify/functions/unsub.mjs) that takes the person
-- off every list they joined on ComicTable, as the privacy page promises.
-- Only the server functions (service key) read or write this table.
-- Run once in Supabase → SQL Editor, after 29_fan_sync.sql (then 99_rules.sql). Safe to run again.

create table if not exists fan_emails (
  id uuid primary key default gen_random_uuid(),
  comic_id text not null references comics(id) on delete cascade,
  show_id uuid references shows(id) on delete set null,
  subject text not null check (char_length(subject) <= 150),
  body text not null check (char_length(body) <= 3000),
  sent_count int not null default 0,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  sent_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists fan_emails_one_per_show on fan_emails (show_id) where show_id is not null;
create index if not exists fan_emails_comic on fan_emails (comic_id, created_at);
alter table fan_emails enable row level security;
revoke all on fan_emails from anon, authenticated;

-- Tickets taps from these emails are counted like the rest (comictable.com/go/<show>?f=email)
alter table ticket_taps drop constraint if exists ticket_taps_source_check;
alter table ticket_taps add constraint ticket_taps_source_check check (source in ('site', 'coaster', 'embed', 'email', 'other'));

-- Invite links can also go by email (dashboard → the invite card → Email it). Once per link.
alter table invites add column if not exists emailed_at timestamptz;
