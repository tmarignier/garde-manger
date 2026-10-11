// Prepares dist/garde-manger/, a local add-on that Home Assistant builds on the
// server itself, to try an unpublished version: copy the folder into
// the server's /addons folder. Run through `npm run addon:local`, which
// compiles the interface first.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const output = new URL('dist/garde-manger/', root);

// Without the image line, Home Assistant builds the Dockerfile instead of
// downloading the published image.
export function localConfig(config: string): string {
  return config
    .split('\n')
    .filter((line) => !line.startsWith('image:') && !line.startsWith('#'))
    .join('\n');
}

if (import.meta.main) {
  if (!existsSync(new URL('public/js/client/app.js', root))) {
    throw new Error('Compile the interface first: npm run build');
  }
  rmSync(output, { recursive: true, force: true });
  for (const path of ['Dockerfile', 'package.json', 'server', 'shared', 'public']) {
    cpSync(new URL(path, root), new URL(path, output), { recursive: true });
  }
  for (const file of ['DOCS.md', 'CHANGELOG.md', 'icon.png']) {
    cpSync(new URL(`home-assistant/garde-manger/${file}`, root), new URL(file, output));
  }
  const config = readFileSync(new URL('home-assistant/garde-manger/config.yaml', root), 'utf8');
  writeFileSync(new URL('config.yaml', output), localConfig(config));
  console.log('Local add-on ready in dist/garde-manger/: copy this folder into /addons on the server.');
}
