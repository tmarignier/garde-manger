import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { User } from '../shared/types.ts';
import { rowToUser } from './users.ts';

// scrypt cost parameters. They are stored with each hash so they can be raised
// later without invalidating existing passwords.
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export const SESSION_COOKIE = 'session';
export const SESSION_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
// A session used when less than this remains is extended to the full duration,
// so a device used regularly never has to log in again.
const SESSION_RENEW_BELOW_MS = SESSION_DURATION_MS / 2;

type ScryptParams = { N: number; r: number; p: number };

function deriveKey(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // The same accented password can reach us composed or decomposed depending on the device.
    scrypt(password.normalize('NFC'), salt, KEY_LENGTH, params, (error, key) => {
      if (error) {
        reject(error);
      } else {
        resolve(key);
      }
    });
  });
}

// Returns 'scrypt$N$r$p$salt$key', with salt and key in base64.
export async function hashPassword(password: string): Promise<string> {
  const params = { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION };
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, params);
  return ['scrypt', params.N, params.r, params.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, key] = passwordHash.split('$');
  if (algorithm !== 'scrypt' || salt === undefined || key === undefined) {
    return false;
  }
  const expected = Buffer.from(key, 'base64');
  const actual = await deriveKey(password, Buffer.from(salt, 'base64'), { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// A hash of a random password, checked when a login names an unknown user so
// that the response time does not reveal which names exist.
let dummyHash: Promise<string> | undefined;

export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString('base64'));
  await verifyPassword(password, await dummyHash);
}

// Only a hash of the token is stored, so reading the database does not give
// access to open sessions.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

function expiryFrom(now: Date): string {
  return new Date(now.getTime() + SESSION_DURATION_MS).toISOString();
}

// Creates a session and returns its token, to be sent in the session cookie.
export function createSession(db: DatabaseSync, userId: number, now = new Date()): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    hashToken(token),
    userId,
    expiryFrom(now),
  );
  return token;
}

export type SessionLookup = {
  user: User;
  // True when the session was extended and the cookie should be sent again.
  renewed: boolean;
};

// Returns the user of a valid session, extending the session when it gets old.
export function findSession(db: DatabaseSync, token: string, now = new Date()): SessionLookup | null {
  const id = hashToken(token);
  const row: unknown = db
    .prepare(
      `SELECT users.id, users.name, users.is_admin, users.created_at, sessions.expires_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.expires_at > ?`,
    )
    .get(id, now.toISOString());
  if (row === undefined) {
    return null;
  }

  const user = rowToUser(row);
  const expiresAt = typeof row === 'object' && row !== null && 'expires_at' in row ? row.expires_at : null;
  if (typeof expiresAt !== 'string') {
    throw new Error('Unexpected session row');
  }
  const renewed = Date.parse(expiresAt) - now.getTime() < SESSION_RENEW_BELOW_MS;
  if (renewed) {
    db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(expiryFrom(now), id);
  }
  return { user, renewed };
}

export function deleteSession(db: DatabaseSync, token: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
}

// Logs a user out everywhere, except on the device making the request.
export function deleteUserSessions(db: DatabaseSync, userId: number, keepToken: string | null = null): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(
    userId,
    keepToken === null ? '' : hashToken(keepToken),
  );
}

export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (cookieHeader === undefined) {
    return null;
  }
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator !== -1 && part.slice(0, separator).trim() === SESSION_COOKIE) {
      const value = part.slice(separator + 1).trim();
      return value === '' ? null : value;
    }
  }
  return null;
}

// Builds the Set-Cookie value for a session token, or one that removes the
// cookie when token is null. Secure is only possible when the app is reached
// over HTTPS; on the home network it is plain HTTP.
export function sessionCookie(token: string | null, secure: boolean): string {
  const maxAge = token === null ? 0 : Math.floor(SESSION_DURATION_MS / 1000);
  const attributes = [`${SESSION_COOKIE}=${token ?? ''}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (secure) {
    attributes.push('Secure');
  }
  return attributes.join('; ');
}
