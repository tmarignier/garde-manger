import type { HealthResponse } from '../shared/types.ts';
import { accountRoutes } from './account-routes.ts';
import { productRoutes } from './product-routes.ts';
import { ok } from './router.ts';
import type { Route } from './router.ts';
import { shoppingListRoutes } from './shopping-list-routes.ts';
import { appVersion } from './version.ts';

export const routes: readonly Route[] = [
  {
    method: 'GET',
    path: '/api/health',
    access: 'public',
    handler: () => {
      const body: HealthResponse = { ok: true, version: appVersion };
      return ok(body);
    },
  },
  ...accountRoutes,
  ...productRoutes,
  ...shoppingListRoutes,
];
