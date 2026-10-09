import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { openDatabase } from '../server/database.ts';
import { createApp } from '../server/server.ts';

// A browser on one device: keeps the session cookie between requests.
class Device {
  readonly baseUrl: string;
  cookie: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async request(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = {};
    if (this.cookie !== null) {
      headers['Cookie'] = this.cookie;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie !== null) {
      const pair = setCookie.split(';')[0] ?? '';
      this.cookie = pair.endsWith('=') ? null : pair;
    }
    const text = await response.text();
    return { status: response.status, body: text === '' ? undefined : (JSON.parse(text) as unknown) };
  }
}

describe('accounts API', () => {
  let db: DatabaseSync;
  let server: Server;
  let baseUrl = '';

  beforeEach(async () => {
    db = openDatabase(':memory:');
    server = createApp({ db, publicDir: '/nonexistent' });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  async function setUpAdmin(): Promise<Device> {
    const admin = new Device(baseUrl);
    const response = await admin.request('POST', '/api/setup', { name: 'Thibault', password: 'admin-password' });
    assert.equal(response.status, 200);
    return admin;
  }

  async function createMember(admin: Device, name = 'Léa', password = 'lea-password'): Promise<number> {
    const response = await admin.request('POST', '/api/users', { name, password });
    assert.equal(response.status, 201);
    const body = response.body as { user: { id: number } };
    return body.user.id;
  }

  it('asks for setup on first launch only', async () => {
    const device = new Device(baseUrl);
    assert.deepEqual((await device.request('GET', '/api/session')).body, { user: null, setupRequired: true });

    const setup = await device.request('POST', '/api/setup', { name: ' Thibault ', password: 'admin-password' });
    assert.equal(setup.status, 200);
    assert.deepEqual((setup.body as { user: { name: string; isAdmin: boolean } }).user.name, 'Thibault');
    assert.equal((setup.body as { user: { isAdmin: boolean } }).user.isAdmin, true);

    const session = await device.request('GET', '/api/session');
    assert.equal((session.body as { user: { name: string } }).user.name, 'Thibault');

    const other = new Device(baseUrl);
    assert.deepEqual((await other.request('GET', '/api/session')).body, { user: null, setupRequired: false });
    const second = await other.request('POST', '/api/setup', { name: 'Intruder', password: 'intruder-pass' });
    assert.equal(second.status, 409);
  });

  it('validates the setup form', async () => {
    const device = new Device(baseUrl);
    for (const body of [undefined, [], { name: '', password: 'long-enough' }, { name: 'Léa', password: 'short' }]) {
      assert.equal((await device.request('POST', '/api/setup', body)).status, 400, JSON.stringify(body));
    }
  });

  it('requires a session for the API, except public routes', async () => {
    await setUpAdmin();
    const anonymous = new Device(baseUrl);
    assert.equal((await anonymous.request('GET', '/api/health')).status, 200);
    assert.equal((await anonymous.request('GET', '/api/session')).status, 200);
    assert.equal((await anonymous.request('GET', '/api/users')).status, 401);
    assert.equal((await anonymous.request('PUT', '/api/me/password', {})).status, 401);
    // Unknown routes stay 404 so the API does not hide mistakes behind a 401.
    assert.equal((await anonymous.request('GET', '/api/unknown')).status, 404);
  });

  it('lets the admin create an account used from another device', async () => {
    const admin = await setUpAdmin();
    await createMember(admin);

    const phone = new Device(baseUrl);
    const login = await phone.request('POST', '/api/login', { name: 'léa', password: 'lea-password' });
    assert.equal(login.status, 200);
    assert.equal((login.body as { user: { name: string; isAdmin: boolean } }).user.isAdmin, false);
    assert.equal(((await phone.request('GET', '/api/session')).body as { user: { name: string } }).user.name, 'Léa');

    // Members cannot manage accounts.
    assert.equal((await phone.request('GET', '/api/users')).status, 403);
    assert.equal((await phone.request('POST', '/api/users', { name: 'Paul', password: 'paul-password' })).status, 403);

    const users = await admin.request('GET', '/api/users');
    assert.deepEqual(
      (users.body as { users: { name: string }[] }).users.map((user) => user.name),
      ['Léa', 'Thibault'],
    );
  });

  it('refuses a name already taken, whatever its case', async () => {
    const admin = await setUpAdmin();
    await createMember(admin);
    for (const name of ['LÉA', 'thibault', ' Le\u0301a ']) {
      assert.equal((await admin.request('POST', '/api/users', { name, password: 'other-password' })).status, 409, name);
    }
  });

  it('can create another admin', async () => {
    const admin = await setUpAdmin();
    const response = await admin.request('POST', '/api/users', { name: 'Anne', password: 'anne-password', isAdmin: true });
    assert.equal((response.body as { user: { isAdmin: boolean } }).user.isAdmin, true);
    assert.equal((await admin.request('POST', '/api/users', { name: 'Bob', password: 'bob-password', isAdmin: 'yes' })).status, 400);
  });

  it('refuses a wrong password or an unknown name with the same error', async () => {
    await setUpAdmin();
    const device = new Device(baseUrl);
    const wrongPassword = await device.request('POST', '/api/login', { name: 'Thibault', password: 'wrong-password' });
    const unknownName = await device.request('POST', '/api/login', { name: 'Nobody', password: 'wrong-password' });
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(unknownName, wrongPassword);
    assert.equal(device.cookie, null);
  });

  it('closes the previous session of a device that logs in again', async () => {
    const admin = await setUpAdmin();
    await createMember(admin);
    const oldCookie = admin.cookie;
    assert.equal((await admin.request('POST', '/api/login', { name: 'Léa', password: 'lea-password' })).status, 200);
    assert.notEqual(admin.cookie, oldCookie);

    admin.cookie = oldCookie;
    assert.equal((await admin.request('GET', '/api/users')).status, 401);
  });

  it('logs out', async () => {
    const admin = await setUpAdmin();
    const cookie = admin.cookie;
    const logout = await admin.request('POST', '/api/logout');
    assert.equal(logout.status, 204);
    assert.equal(admin.cookie, null);

    // The old cookie no longer works, even if a device kept it.
    admin.cookie = cookie;
    assert.equal((await admin.request('GET', '/api/users')).status, 401);
  });

  it('changes its own password and logs out the other devices', async () => {
    const admin = await setUpAdmin();
    await createMember(admin);
    const phone = new Device(baseUrl);
    const laptop = new Device(baseUrl);
    await phone.request('POST', '/api/login', { name: 'Léa', password: 'lea-password' });
    await laptop.request('POST', '/api/login', { name: 'Léa', password: 'lea-password' });

    const wrong = await phone.request('PUT', '/api/me/password', { currentPassword: 'nope-nope', newPassword: 'new-password' });
    assert.equal(wrong.status, 403);
    const short = await phone.request('PUT', '/api/me/password', { currentPassword: 'lea-password', newPassword: 'short' });
    assert.equal(short.status, 400);

    const change = await phone.request('PUT', '/api/me/password', {
      currentPassword: 'lea-password',
      newPassword: 'new-password',
    });
    assert.equal(change.status, 204);
    assert.equal((await phone.request('GET', '/api/session')).body !== null, true);
    assert.deepEqual((await laptop.request('GET', '/api/session')).body, { user: null, setupRequired: false });

    const other = new Device(baseUrl);
    assert.equal((await other.request('POST', '/api/login', { name: 'Léa', password: 'lea-password' })).status, 401);
    assert.equal((await other.request('POST', '/api/login', { name: 'Léa', password: 'new-password' })).status, 200);
  });

  it('lets the admin reset a password, which logs the account out', async () => {
    const admin = await setUpAdmin();
    const id = await createMember(admin);
    const phone = new Device(baseUrl);
    await phone.request('POST', '/api/login', { name: 'Léa', password: 'lea-password' });

    assert.equal((await admin.request('PUT', `/api/users/${id}`, { password: 'reset-password' })).status, 204);
    assert.equal((await phone.request('GET', '/api/users')).status, 401);
    assert.equal((await phone.request('POST', '/api/login', { name: 'Léa', password: 'reset-password' })).status, 200);

    assert.equal((await admin.request('PUT', '/api/users/999', { password: 'reset-password' })).status, 404);
    assert.equal((await admin.request('PUT', '/api/users/abc', { password: 'reset-password' })).status, 404);
  });

  it('lets the admin delete an account, but not their own', async () => {
    const admin = await setUpAdmin();
    const id = await createMember(admin);
    const phone = new Device(baseUrl);
    await phone.request('POST', '/api/login', { name: 'Léa', password: 'lea-password' });

    assert.equal((await admin.request('DELETE', `/api/users/${id}`)).status, 204);
    assert.equal((await phone.request('GET', '/api/session')).status, 200);
    assert.equal((await phone.request('GET', '/api/users')).status, 401);
    assert.equal((await admin.request('DELETE', `/api/users/${id}`)).status, 404);

    const users = (await admin.request('GET', '/api/users')).body as { users: { id: number }[] };
    const adminId = users.users[0]?.id;
    assert.equal((await admin.request('DELETE', `/api/users/${adminId}`)).status, 400);
  });

  it('marks the cookie Secure behind an HTTPS proxy', async () => {
    const response = await fetch(`${baseUrl}/api/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
      body: JSON.stringify({ name: 'Thibault', password: 'admin-password' }),
    });
    assert.match(response.headers.get('set-cookie') ?? '', /; Secure$/);
  });
});
