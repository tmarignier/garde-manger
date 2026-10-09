// Development mode: recompiles the client on change and restarts the server on change.
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

const children: ChildProcess[] = [
  // `npm run` puts node_modules/.bin on the PATH; the shell finds tsc on every platform.
  spawn('tsc -p tsconfig.client.json --watch --preserveWatchOutput', { stdio: 'inherit', shell: true }),
  spawn(process.execPath, ['--watch', 'server/index.ts'], { stdio: 'inherit' }),
];

let stopping = false;

function stop(code: number): void {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    child.kill();
  }
  process.exitCode = code;
}

for (const child of children) {
  child.on('exit', (code) => stop(code ?? 0));
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
