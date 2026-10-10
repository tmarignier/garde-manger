import type { DatabaseSync } from 'node:sqlite';
import type { User } from '../shared/types.ts';
import type { CookieOptions } from './auth.ts';
import { HttpError } from './http.ts';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

// Who may call a route: anyone, any logged-in user (the default), or an admin.
export type RouteAccess = 'public' | 'user' | 'admin';

export type RouteContext = {
  db: DatabaseSync;
  params: Record<string, string>;
  body: unknown;
  // The logged-in user, always set for 'user' and 'admin' routes.
  user: User | null;
  sessionToken: string | null;
  // How to set the session cookie for this request.
  cookie: CookieOptions;
};

export type RouteResult = {
  status: number;
  // Undefined for a 204 response.
  body: unknown;
  headers?: Record<string, string>;
};

export type RouteHandler = (context: RouteContext) => RouteResult | Promise<RouteResult>;

export type Route = {
  method: HttpMethod;
  path: string;
  access?: RouteAccess;
  handler: RouteHandler;
};

export type RouteMatch =
  | { kind: 'found'; route: Route; params: Record<string, string> }
  | { kind: 'method-not-allowed'; allowed: HttpMethod[] }
  | { kind: 'not-found' };

export function ok(body: unknown, headers?: Record<string, string>): RouteResult {
  return headers === undefined ? { status: 200, body } : { status: 200, body, headers };
}

export function created(body: unknown): RouteResult {
  return { status: 201, body };
}

export function noContent(): RouteResult {
  return { status: 204, body: undefined };
}

// Returns the logged-in user of a 'user' or 'admin' route.
export function currentUser(context: RouteContext): User {
  if (context.user === null) {
    throw new HttpError(401, 'Authentication required');
  }
  return context.user;
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
      return { kind: 'found', route, params };
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
