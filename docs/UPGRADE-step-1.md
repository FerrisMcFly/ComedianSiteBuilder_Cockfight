# Platform v1: turning it on

This update adds the club database, the new admin, podcast and YouTube auto-import, merch, section switches, the full forum controls and the chat room. Do these in order. It takes about 10 minutes.

## 1. Upgrade the database (Supabase)
In Supabase, open **SQL Editor → New query**. Paste in each file from the `supabase` folder in turn and click **Run**:

1. `03_permissions.sql`. Skip this if you already ran it.
2. `04_platform.sql`, the upgrade.
3. `05_venues.sql`, the starter list of 109 comedy clubs.
4. `06_community.sql`: forum controls, chat, announcements, links, profile and theme settings.

Each should say "Success." Your live site keeps working the whole time.

## 2. Give Netlify the import key
Auto-import runs on Netlify and needs a private key to write new episodes into the database.

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
- **Videos → Connect your YouTube channel:** paste the show's channel link.
- **Settings:** turn sections on or off. Merch starts off; turn it on when you have items to add. As the platform owner, you'll also see **Recently added clubs** here, where you can fix typos or remove duplicates.

## How show entry works now
**Shows → Add shows:**
1. Pick who's performing.
2. Search for the club. If it's not listed, add it right there. It goes straight into the shared club database for every comic. If it looks like a club that's already listed, you'll get a "Did you mean…?" first.
3. Tap the days on the calendar. Times fill in from that club's usual showtimes, so the more shows get entered, the better the guesses get.
4. Paste all your ticket links at once, one per line.
5. Click **Add shows**.

Each show also has a status (on sale, few left, sold out, free, cancelled) that you can change from the list.

## The admin, section by section
- **Content:** Shows, Podcast, Videos, Merch, People.
- **Your site:**
  - **Profile:** tagline, about, contact, and your support link (Patreon, Ko-fi…).
  - **Announcements:** a list with optional links, start/end dates and pinning. Cockfight shows them in the scrolling banner, with the pinned one as the NEW!! line.
  - **Links:** a link-in-bio list.
  - **Theme:** settings that belong to the design. For Cockfight: splash screen, music, banner speed, visitor counter, support banner, cursor trail, webmaster credit.
- **Community:**
  - **Forum:** pin, lock, move and delete topics; edit, delete and ban from any post; reply or start topics as a host (with a Host badge); create, rename, reorder, lock and hide boards.
  - **Chat room:** watch it live, chat as a host, delete messages, ban, slow mode, open/close, clear.
  - **Moderation:** house rules (forum open, protect host names, slow mode, banned words), the ban list, and a log of every moderator action.
- **Settings:** turn whole sections on or off. Chat starts off; turn it on when you're ready.

## For a different front end
Everything a front end needs comes from `site/sdk/csb.js`: one call to `CSB.load()` returns the profile, people, shows, episodes, videos, merch, announcements, links and boards, already filtered for the public. `CSB.forum` and `CSB.chat` run the community. A front end lists its own settings in `theme.json`, and the admin's Theme page builds itself from that file.

## If something goes wrong
- **"Couldn't load your site" in the admin:** `04_platform.sql` hasn't been run yet.
- **Forum or chat errors like "column … does not exist":** `06_community.sql` hasn't been run yet.
- **"The import service isn't set up yet":** step 2 is missing, or Netlify hasn't redeployed since you added the variables. Go to **Deploys → Trigger deploy**.
- **Anything else:** Netlify keeps every version. Go to **Deploys**, click the last good one, and click **Publish deploy**.
