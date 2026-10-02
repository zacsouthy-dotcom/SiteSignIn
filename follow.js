// ============================================================================
//  follow.js  —  Dynamic "Follow Us" pages for Local Link Social Media cards
// ----------------------------------------------------------------------------
//  Drop this file in alongside your other server files (same folder as
//  index.js / db.js), then wire it in with the 3 lines shown at the
//  bottom of this file under "HOW TO WIRE THIS IN".
// ============================================================================

const express = require("express");
const db = require("./db");

const router = express.Router();

// ---------------------------------------------------------------------------
//  1. TABLE SETUP — safe to run every time the server starts.
//     Uses "IF NOT EXISTS" so it will never touch your existing tables
//     (like your "sites" table) or wipe existing data on restart.
// ---------------------------------------------------------------------------
db.prepare(`
  CREATE TABLE IF NOT EXISTS follow_pages (
    slug             TEXT PRIMARY KEY,      -- used in the URL: /follow/:slug
    business_name    TEXT NOT NULL,
    subtitle         TEXT DEFAULT '',       -- e.g. "Hastings, Hawke's Bay" or "Est. 1978"
    photo_url        TEXT DEFAULT '',       -- a hosted image URL, or leave blank to use initials
    initials         TEXT DEFAULT '',       -- shown if photo_url is blank, e.g. "RN"
    accent_color     TEXT DEFAULT '#ff8a2b',
    accent_color_dk  TEXT DEFAULT '#ff6a00',
    instagram_handle TEXT DEFAULT '',       -- leave blank to hide this platform
    facebook_url     TEXT DEFAULT '',       -- full URL (works with share links too)
    facebook_name    TEXT DEFAULT '',       -- display name under "Facebook"
    tiktok_handle    TEXT DEFAULT '',
    created_at       TEXT DEFAULT (datetime('now'))
  )
`).run();

// ---------------------------------------------------------------------------
//  2. ADMIN PROTECTION — reuses your existing ADMIN_KEY.
//     Visit any admin URL with ?key=YOUR_ADMIN_KEY on the end.
// ---------------------------------------------------------------------------
const ADMIN_KEY = process.env.ADMIN_KEY || "changeme";

function requireAdmin(req, res, next) {
  const key = req.query.key || (req.body && req.body.key);
  if (key !== ADMIN_KEY) {
    return res.status(401).send("Not authorised. Add ?key=YOUR_ADMIN_KEY to the URL.");
  }
  next();
}

// ---------------------------------------------------------------------------
//  3. THE PUBLIC PAGE — this is what the NFC tag points to.
//     e.g. https://llsite.pro/follow/gypsyfair
// ---------------------------------------------------------------------------
router.get("/follow/:slug", (req, res) => {
  const client = db.prepare("SELECT * FROM follow_pages WHERE slug = ?").get(req.params.slug);

  if (!client) {
    return res.status(404).send("That page doesn't exist yet.");
  }

  res.send(renderFollowPage(client));
});

// ---------------------------------------------------------------------------
//  4. ADMIN: LIST ALL CLIENTS
//     https://llsite.pro/admin/follow?key=YOUR_ADMIN_KEY
// ---------------------------------------------------------------------------
router.get("/admin/follow", requireAdmin, (req, res) => {
  const clients = db.prepare("SELECT * FROM follow_pages ORDER BY created_at DESC").all();

  const rows = clients.map(c => `
    <tr>
      <td>${c.business_name}</td>
      <td><a href="/follow/${c.slug}" target="_blank">/follow/${c.slug}</a></td>
      <td><a href="/admin/follow/${c.slug}/edit?key=${req.query.key}">Edit</a></td>
    </tr>
  `).join("");

  res.send(`
    <!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Follow Pages — Admin</title>
    <style>
      body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 20px auto; padding: 0 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; display: block; overflow-x: auto; white-space: nowrap; }
      td, th { text-align: left; padding: 10px; border-bottom: 1px solid #ddd; }
      a.button { display: inline-block; background: #ff8a2b; color: #fff; padding: 14px 22px;
                 border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px; }
    </style>
    </head><body>
      <h1>Follow Pages</h1>
      <a class="button" href="/admin/follow/new?key=${req.query.key}">+ Add New Client</a>
      <table>
        <tr><th>Business</th><th>Live URL</th><th></th></tr>
        ${rows || "<tr><td colspan='3'>No clients yet.</td></tr>"}
      </table>
    </body></html>
  `);
});

// ---------------------------------------------------------------------------
//  5. ADMIN: ADD NEW CLIENT (form)
// ---------------------------------------------------------------------------
router.get("/admin/follow/new", requireAdmin, (req, res) => {
  res.send(adminForm({ key: req.query.key }));
});

router.post("/admin/follow/new", requireAdmin, (req, res) => {
  const b = req.body;
  try {
    db.prepare(`
      INSERT INTO follow_pages
        (slug, business_name, subtitle, photo_url, initials, accent_color, accent_color_dk,
         instagram_handle, facebook_url, facebook_name, tiktok_handle)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.slug.trim().toLowerCase(),
      b.business_name.trim(),
      b.subtitle.trim(),
      b.photo_url.trim(),
      b.initials.trim().toUpperCase(),
      b.accent_color || "#ff8a2b",
      b.accent_color_dk || "#ff6a00",
      b.instagram_handle.trim(),
      b.facebook_url.trim(),
      b.facebook_name.trim(),
      b.tiktok_handle.trim()
    );
    res.redirect(`/admin/follow?key=${req.query.key}`);
  } catch (err) {
    res.status(400).send("Error: " + err.message + " (slug might already be taken)");
  }
});

// ---------------------------------------------------------------------------
//  6. ADMIN: EDIT EXISTING CLIENT
// ---------------------------------------------------------------------------
router.get("/admin/follow/:slug/edit", requireAdmin, (req, res) => {
  const client = db.prepare("SELECT * FROM follow_pages WHERE slug = ?").get(req.params.slug);
  if (!client) return res.status(404).send("Not found.");
  res.send(adminForm({ key: req.query.key, client }));
});

router.post("/admin/follow/:slug/edit", requireAdmin, (req, res) => {
  const b = req.body;
  db.prepare(`
    UPDATE follow_pages SET
      business_name = ?, subtitle = ?, photo_url = ?, initials = ?,
      accent_color = ?, accent_color_dk = ?, instagram_handle = ?,
      facebook_url = ?, facebook_name = ?, tiktok_handle = ?
    WHERE slug = ?
  `).run(
    b.business_name.trim(), b.subtitle.trim(), b.photo_url.trim(), b.initials.trim().toUpperCase(),
    b.accent_color || "#ff8a2b", b.accent_color_dk || "#ff6a00", b.instagram_handle.trim(),
    b.facebook_url.trim(), b.facebook_name.trim(), b.tiktok_handle.trim(),
    req.params.slug
  );
  res.redirect(`/admin/follow?key=${req.query.key}`);
});

// ============================================================================
//  TEMPLATE HELPERS
// ============================================================================

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function adminForm({ key, client }) {
  const c = client || {};
  const isEdit = !!client;
  const action = isEdit ? `/admin/follow/${c.slug}/edit?key=${key}` : `/admin/follow/new?key=${key}`;

  return `
  <!doctype html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${isEdit ? "Edit" : "New"} Client — Follow Pages</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 520px; margin: 20px auto; padding: 0 16px; }
    label { display: block; margin-top: 16px; font-weight: 600; font-size: 14px; }
    input { width: 100%; padding: 12px; margin-top: 6px; border: 1px solid #ccc; border-radius: 8px; font-size: 16px; }
    input[type="color"] { padding: 4px; height: 44px; }
    button { width: 100%; margin-top: 26px; background: #ff8a2b; color: #fff; border: none; padding: 16px 20px;
             border-radius: 8px; font-weight: 700; font-size: 17px; cursor: pointer; }
    .hint { font-size: 12px; color: #888; margin-top: 4px; }
  </style>
  </head><body>
    <h1>${isEdit ? "Edit" : "Add New"} Client</h1>
    <form method="POST" action="${action}">
      ${!isEdit ? `
      <label>URL slug (letters/numbers only, no spaces)</label>
      <input name="slug" required pattern="[a-z0-9-]+" placeholder="e.g. hobbylords">
      <div class="hint">Page will be live at llsite.pro/follow/this-value</div>
      ` : ""}

      <label>Business name</label>
      <input name="business_name" required value="${escapeHtml(c.business_name)}">

      <label>Subtitle</label>
      <input name="subtitle" value="${escapeHtml(c.subtitle)}" placeholder="e.g. Hastings, Hawke's Bay">

      <label>Photo URL (optional — leave blank to use initials)</label>
      <input name="photo_url" value="${escapeHtml(c.photo_url)}">

      <label>Initials (used if no photo)</label>
      <input name="initials" maxlength="3" value="${escapeHtml(c.initials)}" placeholder="e.g. HL">

      <label>Accent colour</label>
      <input name="accent_color" type="color" value="${c.accent_color || "#ff8a2b"}">

      <label>Accent colour (darker shade, for gradient)</label>
      <input name="accent_color_dk" type="color" value="${c.accent_color_dk || "#ff6a00"}">

      <label>Instagram handle (no @, leave blank to hide)</label>
      <input name="instagram_handle" value="${escapeHtml(c.instagram_handle)}">

      <label>Facebook URL (leave blank to hide)</label>
      <input name="facebook_url" value="${escapeHtml(c.facebook_url)}">

      <label>Facebook display name</label>
      <input name="facebook_name" value="${escapeHtml(c.facebook_name)}">

      <label>TikTok handle (no @, leave blank to hide)</label>
      <input name="tiktok_handle" value="${escapeHtml(c.tiktok_handle)}">

      <button type="submit">${isEdit ? "Save Changes" : "Create Page"}</button>
    </form>
  </body></html>
  `;
}

function renderFollowPage(c) {
  const igBlock = c.instagram_handle ? `
    <a class="link-btn" href="instagram://user?username=${c.instagram_handle}"
       onclick="return openWithFallback(event, 'https://instagram.com/${c.instagram_handle}')">
      <div class="link-icon ig"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg></div>
      <div class="link-text"><div class="link-platform">Instagram</div><div class="link-handle">@${c.instagram_handle}</div></div>
      <div class="link-arrow">→</div>
    </a>` : "";

  const fbBlock = c.facebook_url ? `
    <a class="link-btn" href="${c.facebook_url}" target="_blank" rel="noopener">
      <div class="link-icon fb"><svg viewBox="0 0 24 24" fill="#fff"><path d="M13.5 21v-7.5H16l.5-3.5h-3V7.8c0-1 .3-1.7 1.7-1.7H16.6V3.1C16.3 3 15.3 3 14.2 3c-2.4 0-4 1.5-4 4.2V10H7.7v3.5h2.5V21h3.3z"/></svg></div>
      <div class="link-text"><div class="link-platform">Facebook</div><div class="link-handle">${escapeHtml(c.facebook_name || c.business_name)}</div></div>
      <div class="link-arrow">→</div>
    </a>` : "";

  const ttBlock = c.tiktok_handle ? `
    <a class="link-btn" href="https://www.tiktok.com/@${c.tiktok_handle}" target="_blank" rel="noopener">
      <div class="link-icon tt"><svg viewBox="0 0 24 24" fill="#fff"><path d="M14 3c.3 1.8 1.6 3.1 3.4 3.4v2.6c-1.2 0-2.4-.4-3.4-1.1v6.2A5.1 5.1 0 1 1 9.1 9v2.7a2.4 2.4 0 1 0 2.3 2.4V3H14z"/></svg></div>
      <div class="link-text"><div class="link-platform">TikTok</div><div class="link-handle">@${c.tiktok_handle}</div></div>
      <div class="link-arrow">→</div>
    </a>` : "";

  const avatarInner = c.photo_url
    ? `<img src="${escapeHtml(c.photo_url)}" alt="${escapeHtml(c.business_name)}">`
    : escapeHtml(c.initials || "?");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Follow Us — ${escapeHtml(c.business_name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  :root {
    box-sizing: border-box;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    --bg: #0a0908; --card-bg: rgba(255,255,255,0.045); --card-border: rgba(255,255,255,0.09);
    --text: #ffffff; --text-dim: rgba(255,255,255,0.6); --text-dimmer: rgba(255,255,255,0.4);
    --accent: ${c.accent_color}; --accent-grad: linear-gradient(135deg,${c.accent_color},${c.accent_color_dk});
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) {
      --bg: #f5f3ef; --card-bg: #ffffff; --card-border: rgba(0,0,0,0.08);
      --text: #17140f; --text-dim: rgba(0,0,0,0.6); --text-dimmer: rgba(0,0,0,0.45);
    }
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { min-height:100%; background: var(--bg); font-family:'Inter',-apple-system,sans-serif; }
  body { display:flex; align-items:center; justify-content:center; padding:32px 20px calc(32px + env(safe-area-inset-bottom,0px)); }
  .grid { position:fixed; inset:-60px; z-index:0; pointer-events:none;
    background-image: linear-gradient(rgba(255,140,40,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,140,40,0.06) 1px, transparent 1px);
    background-size:44px 44px; }
  .glow { position:fixed; top:-200px; right:-200px; width:560px; height:560px; z-index:0; pointer-events:none;
    background: radial-gradient(circle, rgba(255,120,20,0.3) 0%, rgba(255,120,20,0) 70%); }
  .card { position:relative; z-index:1; width:100%; max-width:420px; background: var(--card-bg); border:1px solid var(--card-border);
    border-radius:28px; padding:44px 32px 32px; backdrop-filter: blur(8px); text-align:center; }
  .biz-avatar { width:88px; height:88px; border-radius:50%; margin:0 auto 18px; background: var(--accent-grad);
    display:flex; align-items:center; justify-content:center; font-size:34px; font-weight:800; color:#1a1206; overflow:hidden; }
  .biz-avatar img { width:100%; height:100%; object-fit:cover; }
  .biz-name { font-size:26px; font-weight:800; color: var(--text); margin-bottom:6px; }
  .biz-sub { font-size:15px; color: var(--text-dim); margin-bottom:30px; }
  .follow-tag { display:inline-block; background: rgba(255,138,43,0.14); color: var(--accent);
    border:1px solid rgba(255,138,43,0.4); font-size:13px; font-weight:800; letter-spacing:1.5px;
    text-transform:uppercase; padding:8px 20px; border-radius:999px; margin-bottom:26px; }
  .link-list { display:flex; flex-direction:column; gap:14px; margin-bottom: 28px; }
  .link-btn { display:flex; align-items:center; gap:14px; width:100%; background: rgba(255,255,255,0.04);
    border:1px solid var(--card-border); border-radius:16px; padding:16px 18px; text-decoration:none; transition: transform .15s ease; }
  .link-btn:active { transform: scale(0.97); }
  .link-icon { width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .link-icon svg { width:22px; height:22px; }
  .ig { background: linear-gradient(135deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5); }
  .fb { background:#1877f2; }
  .tt { background:#17140f; border:1px solid rgba(255,255,255,0.15); }
  .link-text { text-align:left; flex:1; }
  .link-platform { font-size:16px; font-weight:700; color: var(--text); }
  .link-handle { font-size:13px; color: var(--text-dimmer); margin-top:1px; }
  .link-arrow { color: var(--text-dimmer); font-size:18px; }
  .footer { margin-top:8px; font-size:13px; color: var(--text-dimmer); display:flex; align-items:center; justify-content:center; gap:6px; }
  .footer svg { width:14px; height:14px; }
  .footer b { color: var(--accent); }
</style>
</head>
<body>
  <div class="grid"></div>
  <div class="glow"></div>
  <div class="card">
    <div class="biz-avatar">${avatarInner}</div>
    <div class="biz-name">${escapeHtml(c.business_name)}</div>
    <div class="biz-sub">${escapeHtml(c.subtitle)}</div>
    <div class="follow-tag">Follow Us On</div>
    <div class="link-list">${igBlock}${fbBlock}${ttBlock}</div>
    <div class="footer">
      <svg viewBox="0 0 24 24" fill="none" stroke="${c.accent_color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
      Powered by <b>Local Link</b>
    </div>
  </div>
  <script>
    function openWithFallback(event, webUrl) {
      var fallbackTimer = setTimeout(function () { window.location.href = webUrl; }, 600);
      window.addEventListener('blur', function onBlur() {
        clearTimeout(fallbackTimer);
        window.removeEventListener('blur', onBlur);
      });
      return true;
    }
  </script>
</body>
</html>`;
}

module.exports = router;

// ============================================================================
//  HOW TO WIRE THIS IN — add these lines to your main server file
// ============================================================================
//
//  1. Near your other requires, add:
//       const followRouter = require("./follow");
//
//  2. You need form-body parsing for the admin forms. If you don't already
//     have this line, add it near your other app.use() calls:
//       app.use(express.urlencoded({ extended: true }));
//     (Looking at your existing code, you already have this — good, skip it.)
//
//  3. Mount the router, anywhere after `const app = express();`:
//       app.use(followRouter);
//
//  That's it. Restart the server and the table will be created automatically.
// ============================================================================
