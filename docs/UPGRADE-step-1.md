# ComicTable v1: turning it on

This update adds the club database, the new admin, podcast and YouTube auto-import, merch, section switches, the full forum controls and the chat room. Do these in order. It takes about 10 minutes.

## 1. Upgrade the database (Supabase)
In Supabase, open **SQL Editor → New query**. Paste in each file from the `supabase` folder in turn and click **Run**:

1. `03_permissions.sql`. Skip this if you already ran it.
2. `04_platform.sql`, the upgrade.
3. `05_venues.sql`, the starter list of 109 comedy clubs.
4. `06_community.sql`: forum controls, chat, announcements, links, profile and theme settings.

Each should say "Success." Your live site keeps working the whole time.

## 2. Give Netlify the private key
Auto-import and the Team page run on Netlify and need a private key to work with the database.

1. In Supabase, go to **Project Settings → API keys** and copy the **service_role** key (it may be labeled "secret").
   **Keep this key private.** Never paste it into a page, a chat with anyone, or GitHub.
2. In Netlify, go to your project → **Project configuration → Environment variables → Add a variable**, and add two:
   - `SUPABASE_URL` = `https://hzslcnroupkunufbmclw.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = the key you copied. Tick **Contains secret values** if Netlify offers it.

## 3. Go live
Merge the pull request on GitHub, titled "Platform v1". Netlify deploys it in about a minute.

## 4. Connect your content (admin page)
Go to **cockfightpodcast.com/admin** and log in.

- **Podcast → Connect your podcast:** paste `https://podcasts.apple.com/us/podcast/cockfight/id1792746019`, then click **Connect**. It checks every hour after that, and **Check now** runs it right away.
- **Videos → Connect your YouTube channels:** paste the show's channel link, then add each person's channel and pick whose it is. Their videos also show on their page.
- **Settings:** turn sections on or off. Merch starts off; turn it on when you have items to add. As the platform owner, you'll also see **Recently added clubs** here, where you can fix typos or remove duplicates.

## How show entry works now
Click **+ Add shows** on the Shows page. A panel walks you through three steps:
1. **Club:** pick who's performing, then search for the club. If it's not listed, add it right there. It goes straight into the shared club database. If it looks like a club that's already listed, you'll get a "Did you mean…?" first.
2. **Dates:** tap the days on the calendar. Green dots mark days that already have a show.
3. **Times & tickets:** times fill in from that club's usual showtimes. Click **Paste all ticket links at once** and paste them one per line, or paste a single link to use it for every show. Then click **Add shows**.

In the list, change a show's status (on sale, few left, sold out, free, cancelled) right from its row. **Edit** changes anything, and the **⋯** menu has **Duplicate** (same night, new time), **Add more shows at this club**, and **Delete** (with Undo).

## The admin, section by section
**Platform tools (every site gets these):**
- **Content:** Shows, Podcast, Videos, Merch, and People (add, reorder, hide or remove anyone on the site).
- **Community:**
  - **Forum:** pin, lock, move and delete topics; edit, delete and ban from any post; reply or start topics as a host (with a Host badge); create, rename, reorder, lock and hide boards.
  - **Chat room:** watch it live, chat as a host, delete messages, ban, slow mode, open/close, clear.
  - **Moderation:** house rules (forum open, protect host names, slow mode, banned words), the ban list, and a log of every moderator action.
- **Profile:** tagline, about, contact, and your support link (Patreon, Ko-fi…).
- **Settings:** turn whole sections on or off (chat starts off), and manage your **Team**, meaning who can log in. Owners can add people with a username and starting password, as an Editor or another Owner, and can remove them.

**Site extras (only when a site's own front end uses them):** a front end lists what it supports in its `theme.json`. Cockfight's lists:
- **Announcements:** news with optional links, start/end dates and pinning. On Cockfight they scroll in the banner, with the pinned one as the NEW!! line.
- **Links:** a link list. On Cockfight it's the Links box on the home page.
- **Design settings:** Cockfight's own switches: splash screen, music, banner speed, visitor counter, support banner, cursor trail, webmaster credit.

A site whose front end doesn't list any of these never sees them.

## For a different front end
Everything a front end needs comes from `platform/sdk/csb.js`: one call to `CSB.load()` returns the profile, people, shows, episodes, videos, merch, announcements, links and boards, already filtered for the public. `CSB.forum` and `CSB.chat` run the community. A front end lists its own settings in `theme.json`, and the admin's Theme page builds itself from that file.

## Later database upgrades
Each new feature that needs the database changed comes with its own small file in `supabase/`. Run it in the SQL Editor (paste, Run) **before** merging the pull request that uses it. They're all safe to run twice.

| File | What it adds |
|---|---|
| `07_more_sources.sql` | Several podcasts and YouTube channels per site, channels that belong to a person, and channel names on videos |
| `08_create_sites.sql` | Create sites from the admin, super admins who can manage every site, "Want a site?" requests from comictable.com |
| `09_places.sql` | Towns and cities with their map positions, for "fans near a show" |
| `10_fans.sql` | The fan list |
| `11_comics.sql` | Comics shared across sites: one profile and one set of dates everywhere they're on, plus whole-show events |
| `12_show_finder.sql` | The show finder: pages ComicTable checks for new dates, and the Found shows list |
| `13_me.sql` | A comic's own login sees all their dates across sites (the Me page) |
| `14_blog.sql` | The blog |
| `15_home_picks.sql` | Home screen picks: what a comic wants visitors to see first, set from the dashboard (Site extras → Home screen) |
| `18_fan_signup.sql` | QR-code fan sign-up: fans can say where they met you, and the list shows who joined from a QR code |
| `19_more_socials.sql` | More social links on a comic's profile: Threads, Bluesky, Facebook, Twitch, Kick, Snapchat, Spotify, Apple Podcasts, SoundCloud, Substack, Cameo |
| `UPGRADE_V2_ALL.sql` | 07 to 14 in one paste. See `docs/GO-LIVE-v2.md` |

## If something goes wrong
- **"Couldn't load your site" in the admin:** `04_platform.sql` hasn't been run yet.
- **Forum or chat errors like "column … does not exist":** `06_community.sql` hasn't been run yet.
- **"The import service isn't set up yet":** step 2 is missing, or Netlify hasn't redeployed since you added the variables. Go to **Deploys → Trigger deploy**.
- **Anything else:** Netlify keeps every version. Go to **Deploys**, click the last good one, and click **Publish deploy**.
