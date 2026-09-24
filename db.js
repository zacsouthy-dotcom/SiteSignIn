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
    date TEXT NOT NULL,
    time_in TEXT NOT NULL,
    time_out TEXT,
    FOREIGN KEY (site_id) REFERENCES sites(id)
  );
`);

module.exports = db;
