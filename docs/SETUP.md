# Putting the Cockfight site on cockfightpodcast.com

You'll end up with:

- **cockfightpodcast.com**: the public site.
- **cockfightpodcast.com/admin.html**: your private admin page, where you edit tour dates, episodes, hosts, announcements and the forum. Changes go live as soon as you hit Save.

All of it is free. Setup takes about 15 minutes, once.

## The files

| File | What it is |
|---|---|
| `index.html` | The public site |
| `admin.html` | The admin page |
| `config.js` | Your database keys (you fill this in) |
| `setup.sql` | Builds the database (run once) |
| `seed.sql` | Loads everything currently on the site into the database (run once) |

Upload `index.html`, `admin.html` and `config.js` to the same folder on your host. Netlify, Vercel, GitHub Pages, Cloudflare Pages or your registrar's hosting all work. The two `.sql` files never get uploaded to your host. They only get pasted into Supabase.

## 1. Make a free Supabase project
1. Sign up at **supabase.com** and click **New project**. Pick any name and password, and wait about a minute for it to finish.
2. Open **Project Settings → API** and copy two things:
   - the **Project URL** (looks like `https://abcd1234.supabase.co`)
   - the **anon public** key (a long string starting with `eyJ`). It's meant to be public, so it's fine on your site.

## 2. Build the database
1. In Supabase, open **SQL Editor → New query**.
2. Paste in everything from `setup.sql` and click **Run**.
3. Open another **New query**, paste everything from `seed.sql`, and click **Run**. That loads the current episodes, tour dates, host bios and announcements.

## 3. Connect the site
Open `config.js` in any text editor and paste in your two values:

```js
window.COMICTABLE_CONFIG = {
  SUPABASE_URL: "https://abcd1234.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...your anon key..."
};
```

Upload `index.html`, `admin.html` and `config.js`. The forum is now shared by everyone, and the site reads its content from the database.

## 4. Make your admin login
You can log in with a plain username. A username like `LevIsGay` becomes the email `levisgay@cockfightpodcast.com` behind the scenes, and that inbox doesn't need to exist.

1. In Supabase, open **Authentication → Users → Add user → Create new user**.
   - Email: `levisgay@cockfightpodcast.com` (your username, all lowercase, plus `@cockfightpodcast.com`)
   - Password: your password
   - Tick **Auto Confirm User**
2. Open **SQL Editor → New query** and run:

   ```sql
   insert into admins (user_id) select id from auth.users where email = 'levisgay@cockfightpodcast.com';
   ```
3. Go to **cockfightpodcast.com/admin.html** and log in with the username `LevIsGay` and your password.

To give one of the guys their own login, repeat step 4 with a different username.

## 5. Lock down sign-ups (recommended)
In Supabase, open **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**. Even if someone did sign up, they couldn't edit anything, since only emails you add in step 4 are admins. Turning sign-ups off just keeps strangers out of your user list.

## Using the admin page
- **Tour Dates:** add a show with the comedian, date, time, city, venue and ticket link. Past shows disappear from the public site automatically, and a button clears them out of the list.
- **Episodes:** add each new episode with its number, title, date, listen link, and whether Part 2 is on Patreon. The newest one gets the NEW! badge. Descriptions are optional.
- **Hosts:** edit bios, social links (Instagram, YouTube, TikTok, X, Linktree) and upload new photos from your phone or computer. Leave Status blank and the site fills it in from their tour dates.
- **Home screen → News:** banners scroll across the top and the first one is the NEW!! line on the home page. Cards show under "What's New"; one that links to a YouTube or Vimeo video plays right there.
- **Forum:** delete spam topics or individual posts.

## Good to know
- Everything on the site comes from the dashboard. Nothing is baked into the page, so there's nothing stale to clean up. If the database can't be reached, the site says so instead of showing old content.
- A host with no photo shows their initials, never someone else's picture.
- The hidden mute is the © in the footer, and there's a speaker button in the header. Alt+M works too.
