import { readFileSync } from 'node:fs';

// The app's version, read once from package.json: the same source as the
// add-on releases, so it never has to be updated anywhere else.
export const appVersion = readVersion(new URL('../package.json', import.meta.url));

export function readVersion(packageJsonUrl: URL): string {
  const packageJson: unknown = JSON.parse(readFileSync(packageJsonUrl, 'utf8'));
  if (
    typeof packageJson === 'object' && packageJson !== null && 'version' in packageJson &&
    typeof packageJson.version === 'string'
  ) {
    return packageJson.version;
  }
  throw new Error('package.json has no version');
}
