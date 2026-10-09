import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SESSION_DURATION_MS,
  createSession,
  deleteSession,
  deleteUserSessions,
  findSession,
  hashPassword,
  readSessionToken,
  sessionCookie,
  verifyPassword,
} from '../server/auth.ts';
import { openDatabase } from '../server/database.ts';
import { insertUser } from '../server/users.ts';
import { isValidPassword, normalizeName } from '../shared/accounts.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('passwords', () => {
  it('verifies the right password only', async () => {
    const hash = await hashPassword('correct horse');
    assert.match(hash, /^scrypt\$16384\$8\$1\$/);
    assert.equal(await verifyPassword('correct horse', hash), true);
    assert.equal(await verifyPassword('correct horsE', hash), false);
  });

  it('salts each hash', async () => {
    assert.notEqual(await hashPassword('same password'), await hashPassword('same password'));
  });

  it('rejects a malformed hash', async () => {
    assert.equal(await verifyPassword('anything', 'plain-text'), false);
  });
});

describe('account rules', () => {
  it('trims names and rejects empty or long ones', () => {
    assert.equal(normalizeName('  Léa '), 'Léa');
    assert.equal(normalizeName('   '), null);
    assert.equal(normalizeName('x'.repeat(51)), null);
  });

  it('requires at least 8 characters in a password', () => {
    assert.equal(isValidPassword('1234567'), false);
    assert.equal(isValidPassword('12345678'), true);
  });
});

describe('sessions', () => {
  function setup() {
    const db = openDatabase(':memory:');
    const user = insertUser(db, 'Léa', 'hash', false);
    return { db, user };
  }

  it('finds the user of a session', () => {
    const { db, user } = setup();
    const token = createSession(db, user.id);
    assert.deepEqual(findSession(db, token), { user, renewed: false });
    assert.equal(findSession(db, `${token}x`), null);
  });

  it('does not store the token itself', () => {
    const { db, user } = setup();
    const token = createSession(db, user.id);
    const row: unknown = db.prepare('SELECT id FROM sessions').get();
    assert.notDeepEqual(row, { id: token });
  });

  it('expires sessions and extends the ones in use', () => {
    const { db, user } = setup();
    const start = new Date('2026-01-01T00:00:00Z');
    const token = createSession(db, user.id, start);

    const later = new Date(start.getTime() + 60 * DAY_MS);
    assert.equal(findSession(db, token, later)?.renewed, true);
    // Extended from `later`, so still valid after the first expiry date.
    const afterFirstExpiry = new Date(start.getTime() + SESSION_DURATION_MS + DAY_MS);
    assert.equal(findSession(db, token, afterFirstExpiry)?.renewed, false);

    const tooLate = new Date(later.getTime() + SESSION_DURATION_MS + DAY_MS);
    assert.equal(findSession(db, token, tooLate), null);
  });

  it('deletes a session, or all the sessions of a user but one', () => {
    const { db, user } = setup();
    const first = createSession(db, user.id);
    const second = createSession(db, user.id);
    const third = createSession(db, user.id);

    deleteSession(db, first);
    assert.equal(findSession(db, first), null);

    deleteUserSessions(db, user.id, third);
    assert.equal(findSession(db, second), null);
    assert.notEqual(findSession(db, third), null);

    deleteUserSessions(db, user.id);
    assert.equal(findSession(db, third), null);
  });
});

describe('session cookie', () => {
  it('reads the token from the Cookie header', () => {
    assert.equal(readSessionToken(undefined), null);
    assert.equal(readSessionToken('theme=dark; session=abc-123; other=1'), 'abc-123');
    assert.equal(readSessionToken('mysession=abc'), null);
    assert.equal(readSessionToken('session='), null);
  });

  it('is HttpOnly and SameSite, and Secure over HTTPS', () => {
    assert.equal(
      sessionCookie('abc', false),
      `session=abc; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_MS / 1000}`,
    );
    assert.match(sessionCookie('abc', true), /; Secure$/);
    assert.match(sessionCookie(null, false), /^session=; .*Max-Age=0/);
  });
});
