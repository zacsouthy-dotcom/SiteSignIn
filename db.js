const Database = require("better-sqlite3");
const path = require("path");

// NOTE: On Railway, the filesystem is ephemeral unless you attach a Volume.
// Mount a volume at /data and set DB_PATH=/data/sitesignin.db so records
// survive redeploys. Falls back to a local file for dev/testing.
const dbPath = process.env.DB_PATH || path.join(__dirname, "sitesignin.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    manager TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    date TEXT NOT NULL,
    time_in TEXT NOT NULL,
    time_out TEXT,
    FOREIGN KEY (site_id) REFERENCES sites(id)
  );
`);

// Migration: older deployments already have an `entries` table without the
// `phone` column. Add it if it's missing, so existing data on the Railway
// volume doesn't break when this update is deployed.
const existingColumns = db.prepare("PRAGMA table_info(entries)").all().map((c) => c.name);
if (!existingColumns.includes("phone")) {
  db.exec("ALTER TABLE entries ADD COLUMN phone TEXT");
}

module.exports = db;
