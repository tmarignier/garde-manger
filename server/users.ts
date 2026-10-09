import type { DatabaseSync } from 'node:sqlite';
import { nameKey } from '../shared/accounts.ts';
import type { User } from '../shared/types.ts';

const USER_COLUMNS = 'id, name, is_admin, created_at';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function rowToUser(row: unknown): User {
  if (
    !isRecord(row) ||
    typeof row['id'] !== 'number' ||
    typeof row['name'] !== 'string' ||
    typeof row['is_admin'] !== 'number' ||
    typeof row['created_at'] !== 'string'
  ) {
    throw new Error('Unexpected user row');
  }
  return { id: row['id'], name: row['name'], isAdmin: row['is_admin'] === 1, createdAt: row['created_at'] };
}

export function countUsers(db: DatabaseSync): number {
  const row: unknown = db.prepare('SELECT count(*) AS count FROM users').get();
  if (!isRecord(row) || typeof row['count'] !== 'number') {
    throw new Error('Unexpected count row');
  }
  return row['count'];
}

export function listUsers(db: DatabaseSync): User[] {
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users ORDER BY name`).all().map(rowToUser);
}

export function findUserById(db: DatabaseSync, id: number): User | null {
  const row: unknown = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id);
  return row === undefined ? null : rowToUser(row);
}

export type UserWithPassword = {
  user: User;
  passwordHash: string;
};

// Names are compared without case: 'Léa' and 'LÉA' are the same account.
export function findUserByName(db: DatabaseSync, name: string): UserWithPassword | null {
  return readUserWithPassword(
    db.prepare(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE name_key = ?`).get(nameKey(name)),
  );
}

export function findUserWithPasswordById(db: DatabaseSync, id: number): UserWithPassword | null {
  return readUserWithPassword(db.prepare(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE id = ?`).get(id));
}

function readUserWithPassword(row: unknown): UserWithPassword | null {
  if (row === undefined) {
    return null;
  }
  if (!isRecord(row) || typeof row['password_hash'] !== 'string') {
    throw new Error('Unexpected user row');
  }
  return { user: rowToUser(row), passwordHash: row['password_hash'] };
}

export function nameExists(db: DatabaseSync, name: string): boolean {
  return db.prepare('SELECT 1 FROM users WHERE name_key = ?').get(nameKey(name)) !== undefined;
}

export function insertUser(db: DatabaseSync, name: string, passwordHash: string, isAdmin: boolean): User {
  const row: unknown = db
    .prepare(
      `INSERT INTO users (name, name_key, password_hash, is_admin) VALUES (?, ?, ?, ?) RETURNING ${USER_COLUMNS}`,
    )
    .get(name, nameKey(name), passwordHash, isAdmin ? 1 : 0);
  return rowToUser(row);
}

export function updatePasswordHash(db: DatabaseSync, id: number, passwordHash: string): void {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

export function deleteUser(db: DatabaseSync, id: number): boolean {
  return db.prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
}
