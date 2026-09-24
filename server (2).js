const express = require("express");
const db = require("./db");
const path = require("path");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const ADMIN_KEY = process.env.ADMIN_KEY || "changeme";
const TZ = "Pacific/Auckland";

// ---------- helpers ----------
function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); // YYYY-MM-DD
}
function nowTime() {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}
function displayDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function getSite(slug) {
  return db.prepare("SELECT * FROM sites WHERE slug = ?").get(slug);
}
function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Local Link</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
  <header class="topbar">
    <span class="brand">Local<span class="accent">Link</span></span>
  </header>
  <main>${body}</main>
</body>
</html>`;
}

// ---------- public: sign-in page ----------
app.get("/site/:slug", (req, res) => {
  const site = getSite(req.params.slug);
  if (!site) return res.status(404).send(layout("Not found", `<div class="card"><h1>Site not found</h1><p>Check the tag or link and try again.</p></div>`));

  const signedIn = db
    .prepare("SELECT * FROM entries WHERE site_id = ? AND date = ? AND time_out IS NULL ORDER BY time_in DESC")
    .all(site.id, today());

  const rows = signedIn
    .map(
      (e) => `
      <li class="entry">
        <div>
          <strong>${escapeHtml(e.name)}</strong>
          ${e.company ? `<span class="muted"> — ${escapeHtml(e.company)}</span>` : ""}
          <div class="muted small">In at ${e.time_in}${e.phone ? ` · ${escapeHtml(e.phone)}` : ""}</div>
        </div>
        <form method="post" action="/site/${site.slug}/signout/${e.id}">
          <button class="btn btn-outline" type="submit">Sign out</button>
        </form>
      </li>`
    )
    .join("");

  res.send(
    layout(
      site.name,
      `
    <div class="card">
      <h1>${escapeHtml(site.name)}</h1>
      ${site.address ? `<p class="muted">${escapeHtml(site.address)}</p>` : ""}
      ${site.manager ? `<p class="muted">Site Manager: ${escapeHtml(site.manager)}</p>` : ""}
      <p class="notice">Only authorised persons permitted on site. By signing in you confirm you are fit to work and trained for the task you are undertaking.</p>
    </div>

    <div class="card">
      <h2>Sign in</h2>
      <form method="post" action="/site/${site.slug}/signin" class="stack">
        <input name="name" placeholder="Full name" required autocomplete="name">
        <input name="company" placeholder="Company">
        <input name="phone" placeholder="Phone number" type="tel" autocomplete="tel">
        <button class="btn" type="submit">Sign in</button>
      </form>
    </div>

    <div class="card">
      <h2>Currently on site (${signedIn.length})</h2>
      ${signedIn.length ? `<ul class="list">${rows}</ul>` : `<p class="muted">No one signed in yet today.</p>`}
    </div>
  `
    )
  );
});

app.post("/site/:slug/signin", (req, res) => {
  const site = getSite(req.params.slug);
  if (!site) return res.status(404).send("Site not found");
  const name = (req.body.name || "").trim();
  const company = (req.body.company || "").trim();
  const phone = (req.body.phone || "").trim();
  if (!name) return res.redirect(`/site/${site.slug}`);

  db.prepare(
    "INSERT INTO entries (site_id, name, company, phone, date, time_in) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(site.id, name, company, phone, today(), nowTime());

  res.redirect(`/site/${site.slug}`);
});

app.post("/site/:slug/signout/:id", (req, res) => {
  const site = getSite(req.params.slug);
  if (!site) return res.status(404).send("Site not found");

  db.prepare(
    "UPDATE entries SET time_out = ? WHERE id = ? AND site_id = ? AND time_out IS NULL"
  ).run(nowTime(), req.params.id, site.id);

  res.redirect(`/site/${site.slug}`);
});

// ---------- CSV export (for H&S records) ----------
app.get("/site/:slug/export", (req, res) => {
  const site = getSite(req.params.slug);
  if (!site) return res.status(404).send("Site not found");

  const entries = db
    .prepare("SELECT * FROM entries WHERE site_id = ? ORDER BY date DESC, time_in DESC")
    .all(site.id);

  const header = "Date,Name,Company,Phone,Time In,Time Out\n";
  const csvRows = entries
    .map((e) =>
      [displayDate(e.date), e.name, e.company || "", e.phone || "", e.time_in, e.time_out || ""]
        .map(csvEscape)
        .join(",")
    )
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${site.slug}-sign-in-sheet.csv"`
  );
  res.send(header + csvRows);
});

// ---------- admin: create/list sites ----------
app.get("/admin", (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(401).send("Unauthorised");

  const sites = db.prepare("SELECT * FROM sites ORDER BY created_at DESC").all();
  const rows = sites
    .map(
      (s) => `
      <li class="entry">
        <div>
          <strong>${escapeHtml(s.name)}</strong>
          <div class="muted small">/site/${s.slug}</div>
        </div>
        <a class="btn btn-outline" href="/site/${s.slug}/export">Export CSV</a>
      </li>`
    )
    .join("");

  res.send(
    layout(
      "Admin",
      `
    <div class="card">
      <h1>New site</h1>
      <form method="post" action="/admin/sites?key=${encodeURIComponent(req.query.key)}" class="stack">
        <input name="name" placeholder="Site / project name" required>
        <input name="slug" placeholder="URL slug e.g. hobson-rd" required>
        <input name="address" placeholder="Project address">
        <input name="manager" placeholder="Site manager">
        <button class="btn" type="submit">Create site</button>
      </form>
    </div>
    <div class="card">
      <h2>Existing sites</h2>
      ${sites.length ? `<ul class="list">${rows}</ul>` : `<p class="muted">No sites yet.</p>`}
    </div>
  `
    )
  );
});

app.post("/admin/sites", (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(401).send("Unauthorised");

  const { name, address, manager } = req.body;
  const slug = (req.body.slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  if (!name || !slug) return res.redirect(`/admin?key=${req.query.key}`);

  try {
    db.prepare(
      "INSERT INTO sites (slug, name, address, manager) VALUES (?, ?, ?, ?)"
    ).run(slug, name.trim(), (address || "").trim(), (manager || "").trim());
  } catch (e) {
    return res.status(400).send("That slug is already taken — try another.");
  }

  res.redirect(`/admin?key=${req.query.key}`);
});

// ---------- misc ----------
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
function csvEscape(val) {
  const s = String(val ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

app.get("/", (req, res) => {
  res.send(layout("Site Sign In", `<div class="card"><h1>Local Link — Site Sign In</h1><p class="muted">Tap a site tag to sign in or out.</p></div>`));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Site sign-in running on port ${PORT}`));
