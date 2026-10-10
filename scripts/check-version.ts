// Checks that package.json, the add-on's config.yaml and its CHANGELOG.md
// give the same version, and that it matches the release tag when one is given:
//   node scripts/check-version.ts v1.2.3
import { readFileSync } from 'node:fs';

export type Versions = {
  packageVersion: string | null;
  addonVersion: string | null;
  changelogVersion: string | null;
};

const rootUrl = new URL('../', import.meta.url);

function readText(path: string): string {
  return readFileSync(new URL(path, rootUrl), 'utf8');
}

export function readVersions(): Versions {
  const packageJson: unknown = JSON.parse(readText('package.json'));
  const packageVersion =
    typeof packageJson === 'object' && packageJson !== null && 'version' in packageJson &&
    typeof packageJson.version === 'string'
      ? packageJson.version
      : null;
  const addonVersion = /^version: "([^"]+)"$/m.exec(readText('home-assistant/garde-manger/config.yaml'))?.[1] ?? null;
  // The first "## x.y.z" heading is the latest version.
  const changelogVersion = /^## (\S+)/m.exec(readText('home-assistant/garde-manger/CHANGELOG.md'))?.[1] ?? null;
  return { packageVersion, addonVersion, changelogVersion };
}

// Returns the problems found, or an empty list.
export function checkVersions(versions: Versions, tag?: string): string[] {
  const { packageVersion, addonVersion, changelogVersion } = versions;
  const errors: string[] = [];
  if (packageVersion === null || !/^\d+\.\d+\.\d+$/.test(packageVersion)) {
    errors.push(`package.json version is not x.y.z: ${packageVersion}`);
  }
  if (addonVersion !== packageVersion) {
    errors.push(`config.yaml version ${addonVersion} differs from package.json ${packageVersion}`);
  }
  if (changelogVersion !== packageVersion) {
    errors.push(`CHANGELOG.md latest version ${changelogVersion} differs from package.json ${packageVersion}`);
  }
  if (tag !== undefined && tag !== `v${packageVersion}`) {
    errors.push(`Tag ${tag} does not match version ${packageVersion}`);
  }
  return errors;
}

if (import.meta.main) {
  const errors = checkVersions(readVersions(), process.argv[2]);
  for (const error of errors) {
    console.error(error);
  }
  process.exitCode = errors.length === 0 ? 0 : 1;
}
