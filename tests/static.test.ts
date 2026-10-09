import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { resolvePublicPath } from '../server/static.ts';

describe('resolvePublicPath', () => {
  const publicDir = resolve('public');

  it('maps URL paths to files in the public folder', () => {
    assert.equal(resolvePublicPath(publicDir, '/'), join(publicDir, 'index.html'));
    assert.equal(resolvePublicPath(publicDir, '/js/client/app.js'), join(publicDir, 'js', 'client', 'app.js'));
    assert.equal(resolvePublicPath(publicDir, '/mon%20fichier.txt'), join(publicDir, 'mon fichier.txt'));
  });

  it('refuses paths that leave the public folder', () => {
    assert.equal(resolvePublicPath(publicDir, '/../package.json'), null);
    assert.equal(resolvePublicPath(publicDir, '/js/..%2f..%2fpackage.json'), null);
    assert.equal(resolvePublicPath(publicDir, '/%2e%2e/package.json'), null);
  });

  it('refuses malformed paths', () => {
    assert.equal(resolvePublicPath(publicDir, '/%E0'), null);
    assert.equal(resolvePublicPath(publicDir, '/index.html%00.js'), null);
  });
});
