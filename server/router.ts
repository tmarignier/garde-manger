import type { DatabaseSync } from 'node:sqlite';
import { HttpError } from './http.ts';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type RouteContext = {
  db: DatabaseSync;
  params: Record<string, string>;
  body: unknown;
};

export type RouteResult = {
  status: number;
  body: unknown;
};

export type RouteHandler = (context: RouteContext) => RouteResult | Promise<RouteResult>;

export type Route = {
  method: HttpMethod;
  path: string;
  handler: RouteHandler;
};

export type RouteMatch =
  | { kind: 'found'; handler: RouteHandler; params: Record<string, string> }
  | { kind: 'method-not-allowed'; allowed: HttpMethod[] }
  | { kind: 'not-found' };

export function ok(body: unknown): RouteResult {
  return { status: 200, body };
}

// Matches a path such as '/api/products/42' against a pattern such as
// '/api/products/:id'. Returns the named parameters, or null when it does not match.
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (const [index, patternPart] of patternParts.entries()) {
    const pathPart = pathParts[index] ?? '';
    if (patternPart.startsWith(':')) {
      if (pathPart === '') {
        return null;
      }
      params[patternPart.slice(1)] = decodeParam(pathPart);
    } else if (patternPart !== pathPart) {
      return null;
    }
  }
  return params;
}

export function findRoute(routes: readonly Route[], method: string, path: string): RouteMatch {
  const allowed: HttpMethod[] = [];
  for (const route of routes) {
    const params = matchPath(route.path, path);
    if (params === null) {
      continue;
    }
    if (route.method === method) {
      return { kind: 'found', handler: route.handler, params };
    }
    allowed.push(route.method);
  }
  return allowed.length > 0 ? { kind: 'method-not-allowed', allowed } : { kind: 'not-found' };
}

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, 'Invalid URL');
  }
}
