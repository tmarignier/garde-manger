import { fileURLToPath } from 'node:url';
import { openDatabase } from './database.ts';
import { createApp } from './server.ts';

const DEFAULT_PORT = 3000;
const DEFAULT_DATABASE_PATH = './data/garde-manger.db';

function readPort(value: string | undefined): number {
  if (value === undefined || value === '') {
    return DEFAULT_PORT;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

const port = readPort(process.env['PORT']);
const databasePath = process.env['DATABASE_PATH'] || DEFAULT_DATABASE_PATH;
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

const db = openDatabase(databasePath);
const server = createApp({ db, publicDir });

server.listen(port, () => {
  console.log(`garde-manger listening on http://localhost:${port}`);
});

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeAllConnections();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
