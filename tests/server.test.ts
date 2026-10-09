import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { HttpError } from '../server/http.ts';
import { openDatabase } from '../server/database.ts';
import { ok } from '../server/router.ts';
import type { Route } from '../server/router.ts';
import { routes } from '../server/routes.ts';
import { createApp } from '../server/server.ts';

describe('server', () => {
  const db = openDatabase(':memory:');
  const publicDir = mkdtempSync(join(tmpdir(), 'garde-manger-public-'));
  const testRoutes: Route[] = [
    ...routes,
    { method: 'POST', path: '/api/echo', handler: ({ body }) => ok({ received: body }) },
    {
      method: 'GET',
      path: '/api/fail/:kind',
      handler: ({ params }) => {
        if (params['kind'] === 'http') {
          throw new HttpError(409, 'Conflict');
        }
        throw new Error('boom');
      },
    },
  ];
  const server = createApp({ db, publicDir, routes: testRoutes });
  let baseUrl = '';

  before(async () => {
    writeFileSync(join(publicDir, 'index.html'), '<!doctype html><title>Test</title>');
    mkdirSync(join(publicDir, 'js'));
    writeFileSync(join(publicDir, 'js', 'app.js'), 'console.log(1);');
    writeFileSync(join(tmpdir(), 'garde-manger-secret.txt'), 'secret');

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    db.close();
    rmSync(publicDir, { recursive: true, force: true });
    rmSync(join(tmpdir(), 'garde-manger-secret.txt'), { force: true });
  });

  it('answers GET /api/health', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
    assert.deepEqual(await response.json(), { ok: true });
  });

  it('returns a JSON 404 for an unknown API route', async () => {
    const response = await fetch(`${baseUrl}/api/unknown`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Not found' });
  });

  it('returns a 405 with the allowed methods', async () => {
    const response = await fetch(`${baseUrl}/api/health`, { method: 'DELETE' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
    assert.deepEqual(await response.json(), { error: 'Method not allowed' });
  });

  it('passes the parsed JSON body to the handler', async () => {
    const response = await fetch(`${baseUrl}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta: -1 }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { received: { delta: -1 } });
  });

  it('returns a 400 for an invalid JSON body', async () => {
    const response = await fetch(`${baseUrl}/api/echo`, { method: 'POST', body: '{oops' });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Invalid JSON body' });
  });

  it('sends the status and message of an HttpError', async () => {
    const response = await fetch(`${baseUrl}/api/fail/http`);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'Conflict' });
  });

  it('hides the details of an unexpected error', async (t) => {
    t.mock.method(console, 'error', () => {});
    const response = await fetch(`${baseUrl}/api/fail/crash`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Internal server error' });
  });

  it('serves index.html for /', async () => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
    assert.match(await response.text(), /<title>Test<\/title>/);
  });

  it('serves files from subfolders with their content type', async () => {
    const response = await fetch(`${baseUrl}/js/app.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/javascript/);
  });

  it('returns 404 for a missing file', async () => {
    const response = await fetch(`${baseUrl}/missing.css`);
    assert.equal(response.status, 404);
  });

  it('does not serve files outside the public folder', async () => {
    const secretName = 'garde-manger-secret.txt';
    for (const path of [`/../${secretName}`, `/%2e%2e/${secretName}`, `/js/..%2f..%2f${secretName}`]) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 404, path);
    }
  });
});
