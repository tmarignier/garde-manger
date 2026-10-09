import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../server/http.ts';
import { findRoute, matchPath, ok } from '../server/router.ts';
import type { Route } from '../server/router.ts';

describe('matchPath', () => {
  it('matches static paths', () => {
    assert.deepEqual(matchPath('/api/health', '/api/health'), {});
    assert.equal(matchPath('/api/health', '/api/healthz'), null);
    assert.equal(matchPath('/api/health', '/api/health/extra'), null);
  });

  it('extracts and decodes named parameters', () => {
    assert.deepEqual(matchPath('/api/products/:id/adjust', '/api/products/42/adjust'), { id: '42' });
    assert.deepEqual(matchPath('/api/categories/:name', '/api/categories/%C3%A9pices'), { name: 'épices' });
  });

  it('does not match an empty parameter', () => {
    assert.equal(matchPath('/api/products/:id', '/api/products/'), null);
  });

  it('rejects a malformed parameter', () => {
    assert.throws(() => matchPath('/api/products/:id', '/api/products/%E0'), HttpError);
  });
});

describe('findRoute', () => {
  const routes: Route[] = [
    { method: 'GET', path: '/api/products', handler: () => ok([]) },
    { method: 'POST', path: '/api/products', handler: () => ok({}) },
  ];

  it('finds the route for the method and path', () => {
    const match = findRoute(routes, 'POST', '/api/products');
    assert.equal(match.kind, 'found');
  });

  it('lists the allowed methods when only the method differs', () => {
    assert.deepEqual(findRoute(routes, 'DELETE', '/api/products'), {
      kind: 'method-not-allowed',
      allowed: ['GET', 'POST'],
    });
  });

  it('reports unknown paths', () => {
    assert.deepEqual(findRoute(routes, 'GET', '/api/unknown'), { kind: 'not-found' });
  });
});
