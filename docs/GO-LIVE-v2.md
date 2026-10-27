# ComicTable v2: going live

This turns ComicTable into its own thing at **comictable.com**, with Cockfight as one of its sites. It takes about 15 minutes. Cockfight's public site keeps working the whole time.

**What you get:**
- comictable.com (home page), comictable.com/login and comictable.com/dashboard
- **All sites**, where you create a new comic's site in one step
- **Comics shared across sites:** Tristan adds a date once and it shows on Cockfight, Modern Apes and anywhere else he's on
- **Whole-show events**, like "Cockfight LIVE in Chicago"
- **Show finder:** ComicTable checks tour pages, club calendars, ticket pages and calendar links for new dates every hour
- **Fan list:** fans sign up with their city and you see who's near each show. It's off until you turn it on.
- **Super admin:** you can see and manage every site

---

## Step 1: Upgrade the database (Supabase)

1. In Supabase, open **SQL Editor → New query**.
2. Open `supabase/UPGRADE_V2_ALL.sql` on GitHub, click **Raw**, select everything and copy it.
3. Paste it into the SQL Editor and click **Run**. It should say "Success". It's a big file, so give it a few seconds.

**Why:** the new features need new tables: comics, the town list for "fans near a show", the fan list and the show finder. It also adds the rule that lets you, as super admin, see every site. The live Cockfight site keeps working with the upgraded database, so it's safe to do first. It's also safe to run twice.

## Step 2: Merge the update (GitHub)

1. On GitHub, open the pull request titled **"ComicTable v2"**.
2. Click **Merge pull request**, then **Confirm merge**.

**Why:** this puts the new code on `main`, which is what Netlify builds from. Cockfight's Netlify project rebuilds by itself in a minute or two.

**Heads-up:** from now on, cockfightpodcast.com/admin forwards to comictable.com/login. That page won't load until steps 3 and 4 are done, so do them right after.

## Step 3: Make the ComicTable project (Netlify)

1. In Netlify, click **Add new project → Import an existing project → GitHub**, then pick **ComedianSiteBuilder_Cockfight** (the same repo as Cockfight).
2. Leave the build settings as they are. They come from the code.
3. Before deploying, add three **environment variables**:
   - `SITE` = `platform`
   - `SUPABASE_URL` = `https://hzslcnroupkunufbmclw.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = the same private key Cockfight uses (Supabase → Project Settings → API keys → service_role). Tick **Contains secret values**.
4. Click **Deploy**.

**Why:** one code repo runs every site. The `SITE` setting tells each Netlify project which one to build: Cockfight's project builds Cockfight, and this one builds ComicTable itself. The private key lets ComicTable do the behind-the-scenes jobs: the hourly imports for every site, the show finder, and adding people to teams. It's the same key as before, so you're not creating anything new. Keep it private as always.

## Step 4: Connect comictable.com

1. In the new Netlify project, go to **Domain management → Add a domain**, type `comictable.com`, and follow the steps.
2. Netlify shows the DNS records to add. Add them where you bought comictable.com, the same way you did for cockfightpodcast.com.
3. Wait for Netlify to say the domain is verified and the HTTPS certificate is ready. Usually that's minutes, but it can take up to an hour.

**Why:** this points comictable.com at the new project, and HTTPS gives it the padlock.

## Step 5: Check it worked

1. Go to **comictable.com/login** and log in with your usual username and password.
2. You should land on Cockfight's dashboard. Look for **All sites** at the bottom of the menu.
3. In **All sites → Super admins**, remove anyone who isn't you. (When the platform was first set up, everyone who could log in to Cockfight was made a super admin.) They keep their normal access to Cockfight.
4. Optional: in **Shows → Find shows automatically**, paste a page where one of the guys' dates are listed and click **Start checking**.

---

## If something goes wrong
- **comictable.com doesn't load yet:** the domain is still connecting. Check Netlify → Domain management.
- **"Couldn't load your site" after logging in:** step 1 didn't finish. Run `UPGRADE_V2_ALL.sql` again.
- **Imports or "Check now" say the service isn't set up:** the ComicTable project is missing one of the three variables, or hasn't redeployed since you added them. Go to **Deploys → Trigger deploy**.
- **Anything else:** Netlify keeps every version. In the Cockfight project, go to **Deploys**, click the last good one, and click **Publish deploy**.

## Starting a new comic's site (after this is live)
1. **comictable.com/dashboard → All sites → Start a new site.** Type their name and pick what's on their site.
2. In their **People**, add the comics. If someone's already on ComicTable (like Tristan), pick them, and their dates and videos come along.
3. Connect their podcast in **Podcast**, their channels in **Videos**, and their tour pages in **Shows → Find shows automatically**.
4. Ask me to build their front end, then make a Netlify project for it (same repo, with `SITE` set to their site id) and connect their domain.
