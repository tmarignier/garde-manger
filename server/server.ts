import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { findSession, readSessionToken, sessionCookie } from './auth.ts';
import { HttpError, hasBody, isJsonRequest, readJson, sendError, sendJson } from './http.ts';
import { findRoute } from './router.ts';
import type { Route } from './router.ts';
import { routes as defaultRoutes } from './routes.ts';
import { serveStatic } from './static.ts';

export type AppOptions = {
  db: DatabaseSync;
  publicDir: string;
  routes?: readonly Route[];
};

export function createApp(options: AppOptions): Server {
  return createServer((req, res) => {
    handleRequest(req, res, options).catch((error: unknown) => {
      console.error('Unhandled error while handling request', error);
      if (!res.headersSent) {
        sendError(res, 500, 'Internal server error');
      } else {
        res.destroy();
      }
    });
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, options: AppOptions): Promise<void> {
  const method = req.method ?? 'GET';
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    await handleApiRequest(req, res, options, method, pathname);
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  const served = await serveStatic(req, res, options.publicDir, pathname);
  if (!served) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(method === 'HEAD' ? undefined : 'Not found');
  }
}

async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: AppOptions,
  method: string,
  pathname: string,
): Promise<void> {
  try {
    const match = findRoute(options.routes ?? defaultRoutes, method, pathname);
    if (match.kind === 'not-found') {
      throw new HttpError(404, 'Not found');
    }
    if (match.kind === 'method-not-allowed') {
      sendError(res, 405, 'Method not allowed', { Allow: match.allowed.join(', ') });
      return;
    }

    const { route, params } = match;
    const secure = req.headers['x-forwarded-proto'] === 'https';
    const sessionToken = readSessionToken(req.headers.cookie);
    const session = sessionToken === null ? null : findSession(options.db, sessionToken);
    const access = route.access ?? 'user';
    if (access !== 'public' && session === null) {
      throw new HttpError(401, 'Authentication required');
    }
    if (access === 'admin' && session?.user.isAdmin !== true) {
      throw new HttpError(403, 'Admin access required');
    }

    // Requiring JSON on requests with a body means a form on another site
    // cannot post to the API with the family's cookies.
    if (hasBody(req) && !isJsonRequest(req)) {
      throw new HttpError(415, 'Content-Type must be application/json');
    }
    const body = hasBody(req) ? await readJson(req) : undefined;
    const result = await route.handler({
      db: options.db,
      params,
      body,
      user: session?.user ?? null,
      sessionToken: session === null ? null : sessionToken,
      secure,
    });

    const headers: Record<string, string> = {};
    if (session?.renewed === true && sessionToken !== null) {
      headers['Set-Cookie'] = sessionCookie(sessionToken, secure);
    }
    Object.assign(headers, result.headers);
    if (result.status === 204) {
      res.writeHead(204, { 'Cache-Control': 'no-store', ...headers });
      res.end();
      return;
    }
    sendJson(res, result.status, result.body, headers);
  } catch (error) {
    if (error instanceof HttpError) {
      sendError(res, error.status, error.message);
      return;
    }
    throw error;
  }
}
