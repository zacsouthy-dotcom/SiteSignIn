// ============================================================================
//  tags.js  —  Reassignable NFC tags for Site Sign In
// ----------------------------------------------------------------------------
//  Every physical tag gets a permanent link like  llsite.pro/t/A7K2
//  You write THAT link onto the tag once. In the admin panel you choose which
//  site the tag currently points to, and can move it to a new site any time.
//
//  Wire it in with 2 lines in your main server file (see bottom of this file).
// ============================================================================

const express = require("express");
const crypto = require("crypto");
const db = require("./db");

const router = express.Router();
// Read form submissions here directly, so it works no matter where
// app.use(tagsRouter) sits in your server file.
router.use(express.urlencoded({ extended: true }));

// Shows the real error on screen instead of a blank "internal error",
// so it's easy to see what went wrong.
const safe = (fn) => (req, res, next) => {
  try { return fn(req, res, next); }
  catch (err) {
    console.error("[tags.js]", err);
    res.status(500).send(`<pre style="white-space:pre-wrap;font:14px monospace;padding:16px">Tag error:\n${String(err && err.stack || err).replace(/</g, "&lt;")}</pre>`);
  }
};

// ---------------------------------------------------------------------------
//  CHANGE THIS ONE LINE if your sign-in pages live at a different path.
//  It takes a site's slug and returns the page a worker should land on.
//    e.g. if your sign-in page is  llsite.pro/smith-st      -> "/" + slug
//         if it's                  llsite.pro/site/smith-st -> "/site/" + slug
// ---------------------------------------------------------------------------
const signInUrl = (slug) => "/" + slug;

const ADMIN_KEY = process.env.ADMIN_KEY || "changeme";

// Table is created automatically on start-up. Never touches your sites table.
db.prepare(`
  CREATE TABLE IF NOT EXISTS site_tags (
    tag_id      TEXT PRIMARY KEY,
    label       TEXT DEFAULT '',
    site_slug   TEXT DEFAULT NULL,
    updated_at  TEXT DEFAULT (datetime('now'))
  )
`).run();

function requireAdmin(req, res, next) {
  const key = req.query.key || (req.body && req.body.key);
  if (key !== ADMIN_KEY) return res.status(401).send("Not authorised. Add ?key=YOUR_ADMIN_KEY to the URL.");
  next();
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Short, easy-to-read IDs (no 0/O or 1/I to avoid mix-ups)
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newTagId() {
  for (;;) {
    let id = "";
    const bytes = crypto.randomBytes(5);
    for (const b of bytes) id += ALPHABET[b % ALPHABET.length];
    if (!db.prepare("SELECT 1 FROM site_tags WHERE tag_id = ?").get(id)) return id;
  }
}

function allSites() {
  try {
    return db.prepare("SELECT * FROM sites ORDER BY rowid DESC").all();
  } catch {
    return [];
  }
}
const siteName = (s) => s.name || s.site_name || s.address || s.slug;

// ---------------------------------------------------------------------------
//  THE TAP — what every NFC tag opens
// ---------------------------------------------------------------------------
router.get("/t/:tagId", safe((req, res) => {
  const tag = db.prepare("SELECT * FROM site_tags WHERE tag_id = ?").get(req.params.tagId.toUpperCase());
  if (!tag || !tag.site_slug) {
    return res.status(404).send(page("Tag not set up", `
      <h1>This tag isn't set up yet</h1>
      <p>Ask your site manager, or contact Local Link on 022 452 9621.</p>`));
  }
  res.redirect(302, signInUrl(tag.site_slug));
}));

// ---------------------------------------------------------------------------
//  ADMIN — list tags, assign/move them, make new ones
//  https://llsite.pro/admin/tags?key=YOUR_ADMIN_KEY
// ---------------------------------------------------------------------------
router.get("/admin/tags", requireAdmin, safe((req, res) => {
  const key = esc(req.query.key);
  const tags = db.prepare("SELECT * FROM site_tags ORDER BY updated_at DESC").all();
  const sites = allSites();
  const proto = (req.get("x-forwarded-proto") || req.protocol).split(",")[0];
  const host = `${proto}://${req.get("host")}`;

  const options = (current) =>
    `<option value="">— not assigned —</option>` +
    sites.map(s => `<option value="${esc(s.slug)}" ${s.slug === current ? "selected" : ""}>${esc(siteName(s))}</option>`).join("");

  const rows = tags.map(t => `
    <div class="tag">
      <div class="top">
        <span class="id">${esc(t.tag_id)}</span>
        <span class="link">${esc(host)}/t/${esc(t.tag_id)}</span>
      </div>
      <form method="POST" action="/admin/tags/${esc(t.tag_id)}?key=${key}">
        <label>Label (e.g. builder or crew)</label>
        <input name="label" value="${esc(t.label)}" placeholder="e.g. Tyler's crew">
        <label>Points to site</label>
        <select name="site_slug">${options(t.site_slug)}</select>
        <div class="btns">
          <button type="submit">Save</button>
          <button type="submit" formaction="/admin/tags/${esc(t.tag_id)}/delete?key=${key}" class="del"
            onclick="return confirm('Delete tag ${esc(t.tag_id)}? Any card with this tag will stop working.')">Delete</button>
        </div>
      </form>
    </div>`).join("");

  res.send(page("Site Tags — Admin", `
    <h1>Site Tags</h1>
    <form method="POST" action="/admin/tags/new?key=${key}" class="new">
      <label>Make new tags</label>
      <div class="row">
        <input name="count" type="number" min="1" max="50" value="1">
        <button type="submit">+ Create</button>
      </div>
      <div class="hint">Each new tag gets a permanent link. Write that link onto the NFC tag with NFC Tools.</div>
    </form>
    ${sites.length ? "" : `<p class="warn">No sites found in your sites table yet — create a site first, then assign tags to it.</p>`}
    ${rows || "<p>No tags yet.</p>"}
  `));
}));

router.post("/admin/tags/new", requireAdmin, safe((req, res) => {
  const n = Math.min(Math.max(parseInt(req.body.count, 10) || 1, 1), 50);
  const ins = db.prepare("INSERT INTO site_tags (tag_id) VALUES (?)");
  for (let i = 0; i < n; i++) ins.run(newTagId());
  res.redirect(`/admin/tags?key=${encodeURIComponent(req.query.key)}`);
}));

router.post("/admin/tags/:tagId", requireAdmin, safe((req, res) => {
  const slug = (req.body.site_slug || "").trim() || null;
  db.prepare("UPDATE site_tags SET label = ?, site_slug = ?, updated_at = datetime('now') WHERE tag_id = ?")
    .run((req.body.label || "").trim(), slug, req.params.tagId);
  res.redirect(`/admin/tags?key=${encodeURIComponent(req.query.key)}`);
}));

router.post("/admin/tags/:tagId/delete", requireAdmin, safe((req, res) => {
  db.prepare("DELETE FROM site_tags WHERE tag_id = ?").run(req.params.tagId);
  res.redirect(`/admin/tags?key=${encodeURIComponent(req.query.key)}`);
}));

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 560px; margin: 20px auto; padding: 0 16px; color: #16141A; background: #F6F1E4; }
  h1 { font-size: 26px; }
  label { display: block; margin-top: 12px; font-weight: 600; font-size: 14px; }
  input, select { width: 100%; padding: 12px; margin-top: 6px; border: 1px solid #ccc; border-radius: 8px; font-size: 16px; box-sizing: border-box; background: #fff; }
  button { background: #FF6A00; color: #fff; border: none; padding: 12px 18px; border-radius: 8px; font-weight: 700; font-size: 15px; cursor: pointer; }
  button.del { background: #fde8e8; color: #c0392b; border: 1px solid #f3b4b4; }
  .tag, .new { background: #fff; border-radius: 12px; padding: 16px; margin-top: 16px; border: 1px solid #e6dcc6; }
  .top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .id { font-size: 22px; font-weight: 800; letter-spacing: 2px; }
  .link { font-size: 13px; color: #666; word-break: break-all; }
  .btns, .row { display: flex; gap: 10px; margin-top: 14px; }
  .row input { width: 90px; margin-top: 0; }
  .hint { font-size: 12px; color: #888; margin-top: 8px; }
  .warn { background: #fff4e5; padding: 12px; border-radius: 8px; }
</style></head><body>${body}</body></html>`;
}

module.exports = router;

// ============================================================================
//  HOW TO WIRE THIS IN — add to your main server file:
//
//    const tagsRouter = require("./tags");     // near your other requires
//    app.use(tagsRouter);                      // after: const app = express();
//
//  Then check the signInUrl line near the top of this file matches the link
//  your sign-in pages use. Push, and visit /admin/tags?key=YOUR_ADMIN_KEY
// ============================================================================
