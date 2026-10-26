// ============================================================================
//  contact.js  —  Business card landing pages for Local Link
// ----------------------------------------------------------------------------
//  Each card gets a page like  llsite.pro/c/honnor-drilling
//  with big buttons: Call, WhatsApp, Email, Website, and Save Contact.
//  Manage them at  llsite.pro/admin/cards?key=YOUR_ADMIN_KEY
//
//  Wire it in with 2 lines in your main server file (see bottom of this file).
// ============================================================================

const express = require("express");
const multer = require("multer");
const db = require("./db");

const router = express.Router();
router.use(express.urlencoded({ extended: true }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

const ADMIN_KEY = process.env.ADMIN_KEY || "changeme";

db.prepare(`
  CREATE TABLE IF NOT EXISTS contact_cards (
    slug        TEXT PRIMARY KEY,
    name        TEXT DEFAULT '',
    job_title   TEXT DEFAULT '',
    company     TEXT NOT NULL,
    logo        TEXT DEFAULT '',
    accent      TEXT DEFAULT '#2e7d32',
    phone       TEXT DEFAULT '',
    whatsapp    TEXT DEFAULT '',
    email       TEXT DEFAULT '',
    website     TEXT DEFAULT '',
    location    TEXT DEFAULT '',
    updated_at  TEXT DEFAULT (datetime('now'))
  )
`).run();
// add the social columns to an existing table (safe to run every start-up)
for (const col of ["instagram", "tiktok"]) {
  try { db.prepare(`ALTER TABLE contact_cards ADD COLUMN ${col} TEXT DEFAULT ''`).run(); } catch (e) { /* already there */ }
}

const safe = (fn) => async (req, res, next) => {
  try { return await fn(req, res, next); }
  catch (err) {
    console.error("[contact.js]", err);
    res.status(500).send(`<pre style="white-space:pre-wrap;font:14px monospace;padding:16px">Card error:\n${esc(err && err.stack || err)}</pre>`);
  }
};

function requireAdmin(req, res, next) {
  const key = req.query.key || (req.body && req.body.key);
  if (key !== ADMIN_KEY) return res.status(401).send("Not authorised. Add ?key=YOUR_ADMIN_KEY to the URL.");
  next();
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// NZ numbers: "022 452 9621" -> "+64224529621" (for tel: links and WhatsApp)
function intl(num) {
  let d = String(num || "").replace(/[^\d+]/g, "");
  if (!d) return "";
  if (d.startsWith("+")) return d;
  if (d.startsWith("00")) return "+" + d.slice(2);
  if (d.startsWith("0")) return "+64" + d.slice(1);
  return "+" + d;
}
const withHttp = (u) => (!u ? "" : /^https?:\/\//i.test(u) ? u : "https://" + u);
const handle = (h) => String(h || "").trim().replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\//i, "").replace(/^@/, "").replace(/[/?].*$/, "");
const prettyUrl = (u) => String(u || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");

// ---------------------------------------------------------------------------
//  PUBLIC PAGE — what the card opens
// ---------------------------------------------------------------------------
// Save Contact — downloads a vCard the phone opens straight into Contacts
router.get("/c/:slug.vcf", safe((req, res) => {
  const c = db.prepare("SELECT * FROM contact_cards WHERE slug = ?").get(req.params.slug.toLowerCase());
  if (!c) return res.status(404).send("Not found");
  const v = (s) => String(s || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const parts = (c.name || "").trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop() : "";
  const lines = [
    "BEGIN:VCARD", "VERSION:3.0",
    c.name ? `N:${v(last)};${v(parts.join(" "))};;;` : `N:${v(c.company)};;;;`,
    `FN:${v(c.name || c.company)}`,
    `ORG:${v(c.company)}`,
    c.job_title && `TITLE:${v(c.job_title)}`,
    c.phone && `TEL;TYPE=CELL:${intl(c.phone)}`,
    c.whatsapp && c.whatsapp !== c.phone && `TEL;TYPE=CELL:${intl(c.whatsapp)}`,
    c.email && `EMAIL;TYPE=WORK:${c.email}`,
    c.website && `URL:${withHttp(c.website)}`,
    c.instagram && `X-SOCIALPROFILE;TYPE=instagram:https://instagram.com/${handle(c.instagram)}`,
    c.tiktok && `X-SOCIALPROFILE;TYPE=tiktok:https://www.tiktok.com/@${handle(c.tiktok)}`,
    c.location && `ADR;TYPE=WORK:;;${v(c.location)};;;;`,
    "END:VCARD",
  ].filter(Boolean);
  res.set("Content-Type", "text/vcard; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${c.slug}.vcf"`);
  res.send(lines.join("\r\n"));
}));

router.get("/c/:slug", safe((req, res) => {
  const c = db.prepare("SELECT * FROM contact_cards WHERE slug = ?").get(req.params.slug.toLowerCase());
  if (!c) return res.status(404).send(shell("Not found", "#333", `<div class="wrap"><h1>Card not found</h1></div>`));

  const wa = c.whatsapp || c.phone;
  const btn = (href, label, sub, icon, extra = "") =>
    `<a class="btn" href="${esc(href)}" ${extra}><span class="ic">${icon}</span><span class="tx"><b>${label}</b><small>${esc(sub)}</small></span></a>`;

  const buttons = [
    c.phone && btn(`tel:${intl(c.phone)}`, "Call", c.phone, ICONS.phone),
    wa && btn(`https://wa.me/${intl(wa).replace("+", "")}`, "WhatsApp", wa, ICONS.whatsapp, `target="_blank" rel="noopener"`),
    c.email && btn(`mailto:${c.email}`, "Email", c.email, ICONS.email),
    c.website && btn(withHttp(c.website), "Website", prettyUrl(c.website), ICONS.web, `target="_blank" rel="noopener"`),
    c.instagram && btn(`https://instagram.com/${handle(c.instagram)}`, "Instagram", "@" + handle(c.instagram), ICONS.instagram, `target="_blank" rel="noopener"`),
    c.tiktok && btn(`https://www.tiktok.com/@${handle(c.tiktok)}`, "TikTok", "@" + handle(c.tiktok), ICONS.tiktok, `target="_blank" rel="noopener"`),
  ].filter(Boolean).join("");

  const head = c.logo
    ? `<img class="logo" src="${c.logo}" alt="${esc(c.company)}">`
    : `<div class="mono">${esc(c.company.slice(0, 1))}</div>`;

  res.send(shell(c.company, c.accent, `
    <div class="wrap">
      <div class="card">
        ${head}
        ${c.name ? `<h1>${esc(c.name)}</h1>` : (c.logo ? "" : `<h1>${esc(c.company)}</h1>`)}
        ${c.name ? `<p class="co">${esc([c.job_title, c.company].filter(Boolean).join(" · "))}</p>` : (c.job_title ? `<p class="co">${esc(c.job_title)}</p>` : "")}
        ${c.location ? `<p class="loc">${esc(c.location)}</p>` : ""}
      </div>
      <div class="btns">${buttons}</div>
      <a class="save" href="/c/${esc(c.slug)}.vcf">${ICONS.save} Save to contacts</a>
      <p class="foot">Powered by <b>Local Link</b></p>
    </div>`));
}));

// ---------------------------------------------------------------------------
//  ADMIN — llsite.pro/admin/cards?key=YOUR_ADMIN_KEY
// ---------------------------------------------------------------------------
router.get("/admin/cards", requireAdmin, safe((req, res) => {
  const key = esc(req.query.key);
  const cards = db.prepare("SELECT slug, name, company FROM contact_cards ORDER BY updated_at DESC").all();
  const proto = (req.get("x-forwarded-proto") || req.protocol).split(",")[0];
  const host = `${proto}://${req.get("host")}`;
  const list = cards.map(c => `
    <div class="row">
      <div><b>${esc(c.company)}</b>${c.name ? ` · ${esc(c.name)}` : ""}<br><small>${esc(host)}/c/${esc(c.slug)}</small></div>
      <div class="acts">
        <a href="/c/${esc(c.slug)}" target="_blank">View</a>
        <a href="/admin/cards/${esc(c.slug)}?key=${key}">Edit</a>
      </div>
    </div>`).join("");
  res.send(adminShell("Business Cards", `
    <h1>Business Cards</h1>
    <a class="new" href="/admin/cards/new?key=${key}">+ New card</a>
    ${list || "<p>No cards yet.</p>"}`));
}));

router.get("/admin/cards/new", requireAdmin, safe((req, res) => res.send(adminShell("New card", form({}, req.query.key, true)))));

router.get("/admin/cards/:slug", requireAdmin, safe((req, res) => {
  const c = db.prepare("SELECT * FROM contact_cards WHERE slug = ?").get(req.params.slug);
  if (!c) return res.redirect(`/admin/cards?key=${encodeURIComponent(req.query.key)}`);
  res.send(adminShell("Edit " + c.company, form(c, req.query.key, false)));
}));

router.post("/admin/cards/save", upload.single("logo_file"), requireAdmin, safe((req, res) => {
  const b = req.body;
  const slug = String(b.slug || "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  if (!slug || !b.company) return res.status(400).send("Link name and company are required. Go back and fill them in.");
  const old = db.prepare("SELECT logo FROM contact_cards WHERE slug = ?").get(slug);
  let logo = old ? old.logo : "";
  if (req.file) logo = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
  if (b.remove_logo) logo = "";
  const f = (k) => String(b[k] || "").trim();
  db.prepare(`
    INSERT INTO contact_cards (slug, name, job_title, company, logo, accent, phone, whatsapp, email, website, location, instagram, tiktok, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(slug) DO UPDATE SET name=excluded.name, job_title=excluded.job_title, company=excluded.company,
      logo=excluded.logo, accent=excluded.accent, phone=excluded.phone, whatsapp=excluded.whatsapp,
      email=excluded.email, website=excluded.website, location=excluded.location,
      instagram=excluded.instagram, tiktok=excluded.tiktok, updated_at=datetime('now')
  `).run(slug, f("name"), f("job_title"), f("company"), logo, f("accent") || "#2e7d32",
         f("phone"), f("whatsapp"), f("email"), f("website"), f("location"), f("instagram"), f("tiktok"));
  res.redirect(`/admin/cards?key=${encodeURIComponent(req.query.key || b.key)}`);
}));

router.post("/admin/cards/:slug/delete", requireAdmin, safe((req, res) => {
  db.prepare("DELETE FROM contact_cards WHERE slug = ?").run(req.params.slug);
  res.redirect(`/admin/cards?key=${encodeURIComponent(req.query.key)}`);
}));

function form(c, key, isNew) {
  const k = esc(key);
  const field = (name, label, ph = "", type = "text") =>
    `<label>${label}</label><input type="${type}" name="${name}" value="${esc(c[name])}" placeholder="${esc(ph)}">`;
  return `
    <a href="/admin/cards?key=${k}" class="back">← All cards</a>
    <h1>${isNew ? "New card" : esc(c.company)}</h1>
    <form method="POST" action="/admin/cards/save?key=${k}" enctype="multipart/form-data">
      <label>Link name (lowercase, no spaces)</label>
      <input name="slug" value="${esc(c.slug)}" placeholder="e.g. honnor-drilling" ${isNew ? "required" : "readonly"}>
      ${field("company", "Company *", "e.g. Honnor Drilling Ltd")}
      ${field("name", "Person's name", "e.g. John Smith")}
      ${field("job_title", "Job title", "e.g. Director")}
      ${field("phone", "Phone", "e.g. 021 123 4567", "tel")}
      ${field("whatsapp", "WhatsApp (leave blank to use phone)", "e.g. 021 123 4567", "tel")}
      ${field("email", "Email", "e.g. info@company.co.nz", "email")}
      ${field("website", "Website", "e.g. company.co.nz")}
      ${field("instagram", "Instagram handle", "e.g. vantrcommerce")}
      ${field("tiktok", "TikTok handle", "e.g. vantrcommerce")}
      ${field("location", "Location", "e.g. Hastings, Hawke's Bay")}
      <label>Brand colour</label>
      <input name="accent" type="color" value="${esc(c.accent || "#2e7d32")}" style="height:48px;padding:4px">
      <label>Logo</label>
      ${c.logo ? `<img src="${c.logo}" style="max-height:70px;display:block;margin:6px 0"><label class="chk"><input type="checkbox" name="remove_logo" value="1"> Remove logo</label>` : ""}
      <input type="file" name="logo_file" accept="image/*">
      <button type="submit">Save</button>
    </form>
    ${isNew ? "" : `<form method="POST" action="/admin/cards/${esc(c.slug)}/delete?key=${k}"
      onsubmit="return confirm('Delete this card page? The card will stop working.')"><button class="del">Delete</button></form>`}`;
}

function shell(title, accent, body) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<style>
  :root { --a: ${esc(accent)}; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f2f3f1; color: #16181a; }
  .wrap { max-width: 440px; margin: 0 auto; padding: 28px 18px 30px; }
  .card { background: #fff; border-radius: 22px; padding: 28px 20px 22px; text-align: center; border-top: 6px solid var(--a); box-shadow: 0 6px 24px rgba(0,0,0,.06); }
  .logo { max-width: 78%; max-height: 120px; object-fit: contain; display: block; margin: 0 auto 16px; }
  .mono { width: 76px; height: 76px; border-radius: 50%; background: var(--a); color: #fff; font-size: 34px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .co { margin: 0; color: #555; font-size: 15px; }
  .loc { margin: 6px 0 0; color: #888; font-size: 14px; }
  .btns { display: grid; gap: 10px; margin-top: 16px; }
  .btn { display: flex; align-items: center; gap: 14px; background: #fff; border-radius: 16px; padding: 14px 16px; text-decoration: none; color: inherit; box-shadow: 0 2px 10px rgba(0,0,0,.05); }
  .btn:active { transform: scale(.98); }
  .ic { width: 44px; height: 44px; border-radius: 12px; background: var(--a); display: flex; align-items: center; justify-content: center; flex: none; }
  .ic svg { width: 22px; height: 22px; fill: #fff; }
  .tx { display: flex; flex-direction: column; min-width: 0; }
  .tx b { font-size: 16px; }
  .tx small { color: #777; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .save { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 14px; background: var(--a); color: #fff; text-decoration: none; font-weight: 700; padding: 16px; border-radius: 16px; font-size: 16px; }
  .save svg { width: 20px; height: 20px; fill: #fff; }
  .foot { text-align: center; color: #999; font-size: 12px; margin-top: 22px; }
</style></head><body>${body}</body></html>`;
}

function adminShell(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 560px; margin: 20px auto; padding: 0 16px; color: #16141A; background: #F6F1E4; }
  h1 { font-size: 26px; }
  label { display: block; margin-top: 12px; font-weight: 600; font-size: 14px; }
  label.chk { font-weight: 400; }
  input { width: 100%; padding: 12px; margin-top: 6px; border: 1px solid #ccc; border-radius: 8px; font-size: 16px; box-sizing: border-box; background: #fff; }
  input[type=checkbox] { width: auto; }
  button { background: #FF6A00; color: #fff; border: none; padding: 14px 18px; border-radius: 8px; font-weight: 700; font-size: 16px; margin-top: 18px; width: 100%; }
  button.del { background: #fde8e8; color: #c0392b; border: 1px solid #f3b4b4; }
  .row { background: #fff; border-radius: 12px; padding: 14px 16px; margin-top: 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; border: 1px solid #e6dcc6; }
  .row small { color: #777; word-break: break-all; }
  .acts a { margin-left: 12px; color: #FF6A00; font-weight: 700; text-decoration: none; }
  .new { display: inline-block; background: #FF6A00; color: #fff; padding: 12px 18px; border-radius: 8px; font-weight: 700; text-decoration: none; }
  .back { color: #888; text-decoration: none; }
</style></head><body>${body}</body></html>`;
}

const ICONS = {
  instagram: `<svg viewBox="0 0 24 24"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM16.5 2h-9A5.5 5.5 0 0 0 2 7.5v9A5.5 5.5 0 0 0 7.5 22h9a5.5 5.5 0 0 0 5.5-5.5v-9A5.5 5.5 0 0 0 16.5 2zm3.7 14.5a3.7 3.7 0 0 1-3.7 3.7h-9a3.7 3.7 0 0 1-3.7-3.7v-9a3.7 3.7 0 0 1 3.7-3.7h9a3.7 3.7 0 0 1 3.7 3.7z"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24"><path d="M16.6 2h-3.3v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.2a6.3 6.3 0 1 0 5.3 6.2V8.6a7.9 7.9 0 0 0 4.6 1.5V6.8a4.6 4.6 0 0 1-4.6-4.6z"/></svg>`,
  phone: `<svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3 .78.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.25-.12-1.47-.73-1.7-.81s-.39-.12-.56.12-.64.81-.79.98-.29.18-.54.06a6.7 6.7 0 0 1-3.3-2.9c-.25-.43.25-.4.71-1.33a.45.45 0 0 0-.02-.42c-.06-.12-.56-1.34-.76-1.84s-.4-.42-.56-.43h-.48a.92.92 0 0 0-.66.31 2.8 2.8 0 0 0-.87 2.07 4.8 4.8 0 0 0 1 2.56 11 11 0 0 0 4.2 3.7c1.56.67 2.17.73 2.95.62a2.5 2.5 0 0 0 1.66-1.17 2 2 0 0 0 .14-1.17c-.06-.1-.23-.17-.48-.29z"/></svg>`,
  email: `<svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z"/></svg>`,
  web: `<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.95a15.7 15.7 0 0 0-1.38-3.56A8 8 0 0 1 18.9 8zM12 4.04A14 14 0 0 1 13.9 8h-3.8A14 14 0 0 1 12 4.04zM4.26 14a8.2 8.2 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4zm.82 2h2.95a15.7 15.7 0 0 0 1.38 3.56A8 8 0 0 1 5.08 16zM8 8H5.08a8 8 0 0 1 4.33-3.56A15.7 15.7 0 0 0 8.03 8zm4 11.96A14 14 0 0 1 10.1 16h3.8A14 14 0 0 1 12 19.96zM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4zm.25 5.56A15.7 15.7 0 0 0 15.97 16h2.95a8 8 0 0 1-4.33 3.56zM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.2 8.2 0 0 1 0 4z"/></svg>`,
  save: `<svg viewBox="0 0 24 24"><path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
};

module.exports = router;

// ============================================================================
//  HOW TO WIRE THIS IN — add to your main server file, next to the tags lines:
//
//    const contactRouter = require("./contact");
//    app.use(contactRouter);
//
//  Then go to  llsite.pro/admin/cards?key=YOUR_ADMIN_KEY  → + New card.
//  The card page is  llsite.pro/c/<link name>   (write that onto the NFC chip)
// ============================================================================
