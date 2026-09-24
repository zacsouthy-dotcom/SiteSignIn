# Site Sign In — Local Link

Digital tap-to-sign-in/out sheet for building sites. Same stack as your other
Local Link apps (Node/Express), ready to deploy on Railway the same way.

## What it does

- **`/site/:slug`** — the page the NFC tag opens. Shows who's currently on
  site and a simple sign-in form. Sign out is one tap next to your name.
- **`/site/:slug/export`** — downloads a CSV of every sign-in/out for that
  site (full history, not just today) — the H&S record.
- **`/admin?key=YOUR_KEY`** — create new sites and grab each one's export
  link. One admin key protects this for now since it's just you managing it.

## Running locally

```
npm install
ADMIN_KEY=yourkey npm start
```

Then visit `http://localhost:3000/admin?key=yourkey` to create your first
site, and `http://localhost:3000/site/your-slug` to see the tag page.

## Deploying to Railway

1. Push this to its own GitHub repo (e.g. `Local-Link-SiteSignIn`), same as
   your other apps.
2. New Railway project → deploy from that repo.
3. Set the `ADMIN_KEY` environment variable to something only you know.
4. **Attach a Volume** mounted at `/data`, and set `DB_PATH=/data/sitesignin.db`.
   Without this, Railway's filesystem resets on every redeploy and you'll
   lose all sign-in records — this is the one thing worth not skipping.

## Setting up a site (e.g. for Tyler)

1. Go to `/admin?key=yourkey`, fill in the site name, a short slug (e.g.
   `hobson-rd`), address, and site manager.
2. Encode `https://yourapp.up.railway.app/site/hobson-rd` onto an NFC tag,
   same as your other products.
3. Hand it over — that's it, nothing else to set up on their end.

## What's deliberately left out of this first version

- No login for workers — anyone with the tag can sign in, matching how a
  paper sheet works today. Add auth later if you ever need it.
- One admin key for everything, not per-user accounts.
- No photo ID or signature capture — just name and company, matching what
  the paper sheet already asked for.

Worth testing with Tyler's actual site before adding anything beyond this —
better to find out what he actually needs it to do than guess up front.
