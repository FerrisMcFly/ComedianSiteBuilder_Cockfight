# ComicTable

Feature-rich websites for comedians: shows, podcast, videos, merch, and a fan community, all run from one easy admin. Cockfight (cockfightpodcast.com) is site #1.

- `site/`: what Netlify publishes. `index.html` is Cockfight's front end (the 90s Cantina theme, with its settings in `theme.json`), the dashboard is built from `platform/app/` (organized pieces, put together by `tools/admin-page.mjs`), `sdk/csb.js` is the data kit any front end can use, and `config.js` holds the connection.
- `netlify/`: server code. It imports podcast episodes and YouTube videos every hour, or on demand from the admin.
- `supabase/`: the database files, run in order in Supabase's SQL Editor.
- `docs/`: setup notes. Start with `UPGRADE-step-1.md`.
- `tests/`: `npm test` runs the admin, the public site, the importer, and every database file against a real Postgres.
