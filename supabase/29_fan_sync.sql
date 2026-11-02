-- Mailchimp sync (Step 5, item 51): a comic connects their own Mailchimp audience once (dashboard → Fans), and every
-- fan on their list goes into it, tagged "ComicTable" and with their city. New fans follow every 30 minutes
-- (netlify/functions/fan-sync-scheduled.mjs). People who unsubscribed in Mailchimp are never subscribed again.
-- The comic's Mailchimp key is stored encrypted by the server and is never readable from the dashboard: only the
-- fan-sync functions (service key) touch this table.
-- Run once in Supabase → SQL Editor, after 28_ticket_taps.sql (then 99_rules.sql). Safe to run again.

create table if not exists fan_syncs (
  comic_id text primary key references comics(id) on delete cascade,
  provider text not null default 'mailchimp' check (provider in ('mailchimp')),
  secret text not null,                 -- the comic's API key, encrypted (AES-GCM) by the server
  key_hint text,                        -- its last 4 characters, to show which key is connected
  list_id text not null,
  list_name text,
  synced_until timestamptz,             -- fans who joined up to here have been sent
  last_run timestamptz,
  last_count int not null default 0,    -- new people added on the last run
  last_error text,
  connected_by uuid,
  created_at timestamptz not null default now()
);
alter table fan_syncs enable row level security;
revoke all on fan_syncs from anon, authenticated;
