import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Each migration moves the schema from version N to N + 1. The current version
// is stored in SQLite's user_version pragma. Never edit a released migration:
// append a new one instead.
export const migrations: readonly string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ) STRICT;

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX sessions_user_id ON sessions (user_id);

  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    position INTEGER NOT NULL DEFAULT 0
  ) STRICT;

  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category_id INTEGER REFERENCES categories (id) ON DELETE SET NULL,
    unit TEXT NOT NULL DEFAULT '',
    quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    min_quantity REAL NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
    target_quantity REAL CHECK (target_quantity IS NULL OR target_quantity >= 0),
    updated_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ) STRICT;

  CREATE INDEX products_category_id ON products (category_id);

  CREATE TABLE extra_items (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1))
  ) STRICT;
  `,
  // COLLATE NOCASE only ignores the case of ASCII letters ('Élise' and 'élise'
  // would be two accounts). name_key holds the name lowercased by the
  // application, which handles accents.
  `
  ALTER TABLE users ADD COLUMN name_key TEXT NOT NULL DEFAULT '';
  UPDATE users SET name_key = lower(name);
  CREATE UNIQUE INDEX users_name_key ON users (name_key);
  `,
];

export function getSchemaVersion(db: DatabaseSync): number {
  const row: unknown = db.prepare('PRAGMA user_version').get();
  if (typeof row === 'object' && row !== null && 'user_version' in row && typeof row.user_version === 'number') {
    return row.user_version;
  }
  throw new Error('Unable to read the schema version');
}

// Applies the migrations that have not run yet, each in its own transaction.
export function migrate(db: DatabaseSync, allMigrations: readonly string[] = migrations): void {
  const currentVersion = getSchemaVersion(db);
  if (currentVersion > allMigrations.length) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than this application (${allMigrations.length})`,
    );
  }

  for (let version = currentVersion; version < allMigrations.length; version++) {
    const sql = allMigrations[version] ?? '';
    db.exec('BEGIN');
    try {
      db.exec(sql);
      // PRAGMA does not accept bound parameters; version is an integer we control.
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

// Opens the database file (creating its folder if needed) and brings the schema up to date.
// Use ':memory:' for an in-memory database.
export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }
  migrate(db);
  return db;
}
