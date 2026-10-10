import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { checkVersions, readVersions } from '../scripts/check-version.ts';
import { localConfig } from '../scripts/local-addon.ts';

const root = new URL('../', import.meta.url);

function readText(path: string): string {
  return readFileSync(new URL(path, root), 'utf8');
}

describe('Home Assistant add-on', () => {
  it('gives the same version in package.json, config.yaml and CHANGELOG.md', () => {
    assert.deepEqual(checkVersions(readVersions()), []);
  });

  it('checks the release tag against the version', () => {
    const versions = { packageVersion: '1.2.3', addonVersion: '1.2.3', changelogVersion: '1.2.3' };
    assert.deepEqual(checkVersions(versions, 'v1.2.3'), []);
    assert.equal(checkVersions(versions, 'v1.2.4').length, 1);
    assert.equal(checkVersions({ ...versions, addonVersion: '1.2.2' }).length, 1);
  });

  it('builds the local add-on from source instead of the published image', () => {
    const config = readText('home-assistant/garde-manger/config.yaml');
    assert.match(config, /^image: /m);
    const local = localConfig(config);
    assert.doesNotMatch(local, /^image: /m);
    assert.match(local, /^slug: garde_manger$/m);
    assert.match(local, /^backup: cold$/m);
  });

  it('serves the app on the port given to the ingress', () => {
    const config = readText('home-assistant/garde-manger/config.yaml');
    assert.match(config, /^ingress_port: 3000$/m);
    assert.match(readText('Dockerfile'), /PORT=3000/);
  });
});

describe('web app files', () => {
  it('uses relative paths, so the page works behind the ingress prefix', () => {
    const html = readText('public/index.html');
    assert.doesNotMatch(html, /(href|src)="\//);
    assert.doesNotMatch(readText('client/api.ts'), /['`]\/api\//);
  });

  it('has a manifest whose icons exist', () => {
    const manifest: unknown = JSON.parse(readText('public/manifest.webmanifest'));
    assert.ok(typeof manifest === 'object' && manifest !== null && 'icons' in manifest && Array.isArray(manifest.icons));
    assert.ok(manifest.icons.length > 0);
    for (const icon of manifest.icons) {
      assert.ok(typeof icon === 'object' && icon !== null && 'src' in icon && typeof icon.src === 'string');
      assert.ok(existsSync(new URL(`public/${icon.src}`, root)), icon.src);
    }
  });
});
