import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, relative, resolve, isAbsolute } from 'node:path';

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

// Resolves a URL path to a file inside publicDir, or returns null when the
// path is malformed or escapes publicDir.
export function resolvePublicPath(publicDir: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) {
    return null;
  }

  const root = resolve(publicDir);
  const filePath = resolve(join(root, decoded.endsWith('/') ? `${decoded}index.html` : decoded));
  const relativePath = relative(root, filePath);
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return null;
  }
  return filePath;
}

// Serves a file from publicDir. Returns false when there is no such file.
export async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  publicDir: string,
  urlPath: string,
): Promise<boolean> {
  const filePath = resolvePublicPath(publicDir, urlPath);
  if (filePath === null) {
    return false;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return false;
    }
  } catch {
    return false;
  }

  const content = await readFile(filePath);
  res.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': content.length,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(req.method === 'HEAD' ? undefined : content);
  return true;
}
