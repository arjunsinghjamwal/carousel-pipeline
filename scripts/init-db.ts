/**
 * Initialize the SQLite database schema.
 *
 * Run once before first use:
 *   npm run db:init
 *
 * Safe to re-run — all CREATE TABLE statements use IF NOT EXISTS.
 */
import "dotenv/config";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { getDb, closeDb } from "../src/lib/db.js";

const dbPath = process.env.DB_PATH ?? "data/pipeline.db";
mkdirSync(path.dirname(dbPath), { recursive: true });

const db = getDb();

db.exec(`
  -- Pipeline run log. Every stage attempt writes a row here so failures are
  -- always surfaced in the review UI, even if no draft was produced.
  CREATE TABLE IF NOT EXISTS generation_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id         TEXT    NOT NULL,
    stage           TEXT    NOT NULL,
    status          TEXT    NOT NULL CHECK(status IN ('started', 'completed', 'failed')),
    started_at      TEXT    NOT NULL,
    completed_at    TEXT,
    error_message   TEXT,
    pipeline_version TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_runs_item_id ON generation_runs (item_id);

  -- Published (or scheduled) posts. One row per carousel that has been pushed
  -- to Buffer. The ig_media_id is populated after Meta Graph confirms receipt.
  CREATE TABLE IF NOT EXISTS posts (
    id                 TEXT PRIMARY KEY,
    item_id            TEXT NOT NULL UNIQUE,
    buffer_update_id   TEXT,
    ig_media_id        TEXT,
    published_at       TEXT,
    scheduled_at       TEXT,
    caption            TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Daily metrics per post. Polled from Meta Graph API for 30 days per post.
  -- Uses INSERT OR REPLACE so each day's poll overwrites the previous row for
  -- that post (we keep only the latest snapshot per post).
  CREATE TABLE IF NOT EXISTS metrics (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id         TEXT    NOT NULL REFERENCES posts(id),
    polled_at       TEXT    NOT NULL,
    reach           INTEGER DEFAULT 0,
    impressions     INTEGER DEFAULT 0,
    likes           INTEGER DEFAULT 0,
    comments        INTEGER DEFAULT 0,
    shares          INTEGER DEFAULT 0,
    saves           INTEGER DEFAULT 0,
    profile_visits  INTEGER DEFAULT 0,
    follows         INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_metrics_post_id ON metrics (post_id);
`);

console.log(`Database initialized at ${dbPath}`);

closeDb();
