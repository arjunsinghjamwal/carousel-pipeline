import Database from "better-sqlite3";

let _db: Database.Database | null = null;

/**
 * Return the singleton better-sqlite3 connection. The synchronous API is
 * intentional here — see docs/SPEC.md §4 for the rationale.
 *
 * Call scripts/init-db.ts once to create the schema before first use.
 */
export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = process.env.DB_PATH ?? "data/pipeline.db";
    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
  }
  return _db;
}

/** Close the connection. Call this at process exit in long-running scripts. */
export function closeDb(): void {
  _db?.close();
  _db = null;
}
