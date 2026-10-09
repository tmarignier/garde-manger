import type { HealthResponse } from '../shared/types.ts';
import { ok } from './router.ts';
import type { Route } from './router.ts';

export const routes: readonly Route[] = [
  {
    method: 'GET',
    path: '/api/health',
    handler: () => {
      const body: HealthResponse = { ok: true };
      return ok(body);
    },
  },
];
