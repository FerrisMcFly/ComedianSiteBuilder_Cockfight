# Custom-built sites

A custom-built site is a one-off design for one comic. Lev's console lobby and Cockfight's 90s cantina are examples. A custom site runs on the same engine as the templates:
- the comic's Coaster, shows, videos, podcast and fans come from ComicTable
- only the look is new

## The short version

1. **Make the site in the dashboard.** Go to ComicTable → Sites → "Set up a site for a comic", and pick **Custom-built** at step 3. The site works right away on the Starter design while you build.
2. **Start the design.**
   ```
   node tools/new-site.mjs rita-ramos "Rita Ramos" --from punk-flyer
   ```
   - The id must match the site's id.
   - `--from` is optional. It starts from any template in `sites/`. Without it, you get the plain starter.
3. **Preview it with the comic's real data.**
   ```
   node tools/preview.mjs rita-ramos
   ```
   Open http://localhost:8080. Edit `sites/rita-ramos/index.html`, then refresh.
4. **Push it.** The shared host serves `sites/<id>/` as that site's design:
   - at comictable.com/s/rita-ramos/ right away
   - at the comic's own address once it points at ComicTable

   No new Netlify project is needed.

## What a design is

A folder in `sites/<id>/`:

| File | What it is |
|---|---|
| `index.html` | The whole site: one page that loads `config.js`, `sdk/csb.js` and (for most designs) `sdk/templates.js`. |
| `theme.json` | The design's settings, shown on the site's **Design** page: colors, choices and every word the comic can change. |
| `site.json` | `{ "id", "name", "domain" }`. Only templates add `"template": true`, which is what the setup flow offers everyone. |

The build copies `index.html` to `/designs/<id>.html` on comictable.com. The shared host (`netlify/edge-functions/sites.js`) picks a site's design in this order:
1. `theme.design`, if one is set
2. its template
3. a design with the site's own id
4. Starter

## The template kit (`sdk/templates.js`)

```js
CTT.start(function (k, app) {
  // k.name, k.bio, k.tagline, k.photo     who they are (from their Coaster)
  // k.shows()                             upcoming shows: dd, mm, mon, day, dow, label, time, venue, city, tickets, sold, few, free
  // k.ticket(show, className, label)      the Tickets link (or "Soon"); null when sold out
  // k.next                                the next show, or undefined
  // k.video(), k.podcast(), k.socials()   their latest video, the podcast with listen links, their socials
  // k.join({ button })                    the fan sign-up form, or null when the site has no fan list
  // k.has("shows" | "videos" | ...)       what the site has switched on
  // k.t(key, default)                     a line of words from the Design page (see the rules)
  // k.coaster, k.coasterPhoto()           the round-Coaster photo option
  // k.el(tag, attrs, children)            makes elements safely (text is never treated as HTML)
});
```

Lower down, `CSB` (`sdk/csb.js`) has everything else: the forum, chat, blog, merch, the press kit and live streams. Lev's and Cockfight's designs use it directly.

## The rules (founder, Oct 2026)

- **No flavor text is baked in.** Every themed or jokey line and every section heading comes from `k.t(key, default)`, with a matching `"type": "text"` setting in `theme.json`.
  - The comic can retype the line.
  - Clearing it removes the line from the page; skip the element when `k.t` returns `""`.
  - Buttons fall back to their default label.
  - A line that uses `{next_venue}`, `{next_city}`, `{next_date}` or `{next_day}` is left off while there's no upcoming show.
- **Never invent data.** No fake visitor counters, follower counts, reviews or quotes. What the page shows is the comic's own data.
- **Offer the round Coaster.** Add the `photo_shape` setting, and use `k.coaster ? k.coasterPhoto() : yourPhoto`.
- **No other company's look.** Evoke an era all you like, but don't use real product names, logos or slogans.
- **Phone first, desktop intentional.** Most visits come from a bio link.
- **Accessible:**
  - real links and buttons
  - 44px tap targets
  - alt text on photos
  - readable contrast
- **Link previews:** keep the `og:` tags marked `data-ct="title" | "description" | "image"`, so shared links show the comic's name, line and photo.

## Checking it

- `npm test` holds every template to the words rule. It renders each one with every line retyped, then with every line cleared.
- For a custom design, add a line to `tests/templates.test.mjs` or mark it `"template": true` while you test.

## Moving an existing custom site onto the shared host

Lev and Cockfight still run as their own Netlify projects. To move one:
1. Check it at comictable.com/s/<id>/ on a deploy preview, side by side with the live site.
2. Add its domain to the comictable Netlify project (Domain management → Add a domain alias) at a quiet hour. Remove it from the old project first. HTTPS takes a few minutes.
3. Once it's working, delete the old project.
