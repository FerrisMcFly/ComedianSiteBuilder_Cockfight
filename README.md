# Comedian Site Builder

Feature-rich websites for comedians: shows, podcast, videos, merch, and a fan community, all run from one easy admin. Cockfight (cockfightpodcast.com) is site #1.

- `site/`: what Netlify publishes. `index.html` is Cockfight's front end, `admin.html` is the admin panel, and `config.js` holds the connection.
- `netlify/`: server code. It imports podcast episodes and YouTube videos every hour, or on demand from the admin.
- `supabase/`: the database files, run in order in Supabase's SQL Editor.
- `tests/`: run with `npm test`.
- `docs/`: setup notes. Start with `UPGRADE-step-1.md`.
