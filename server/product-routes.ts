import type { DatabaseSync } from 'node:sqlite';
import {
  CATEGORY_NAME_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  UNIT_MAX_LENGTH,
  applyAdjustment,
  isValidDelta,
  isValidQuantity,
  isValidTarget,
  normalizeText,
  roundQuantity,
} from '../shared/products.ts';
import type {
  CategoriesResponse,
  CategoryResponse,
  FrequentProductsResponse,
  ProductHistoryResponse,
  ProductRequest,
  ProductResponse,
  ProductsResponse,
  UpdateProductRequest,
} from '../shared/types.ts';
import { transaction } from './database.ts';
import { HttpError, readObject, readString } from './http.ts';
import {
  FREQUENT_DAYS,
  findProductSnapshot,
  hasProductEvents,
  listFrequentProductIds,
  listProductEvents,
  recordProductEvent,
} from './product-history.ts';
import {
  categoryExists,
  categoryNameExists,
  deleteProduct,
  findProduct,
  insertCategory,
  insertProduct,
  listCategories,
  listProducts,
  renameCategory,
  updateProduct,
  updateQuantity,
} from './products.ts';
import { created, currentUser, noContent, ok } from './router.ts';
import type { Route } from './router.ts';

function readText(body: Record<string, unknown>, key: string, maxLength: number, allowEmpty = false): string {
  const text = normalizeText(readString(body, key), maxLength, allowEmpty);
  if (text === null) {
    throw new HttpError(400, `Invalid ${key}`);
  }
  return text;
}

function readQuantity(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (!isValidQuantity(value)) {
    throw new HttpError(400, `Missing or invalid field: ${key}`);
  }
  return roundQuantity(value);
}

// Reads a product sent to be added or edited. The quantity is required to add
// a product and optional to edit one.
function readProductRequest(db: DatabaseSync, rawBody: unknown): UpdateProductRequest {
  const body = readObject(rawBody);
  const categoryId = body['categoryId'] ?? null;
  if (categoryId !== null && (typeof categoryId !== 'number' || !categoryExists(db, categoryId))) {
    throw new HttpError(400, 'Missing or invalid field: categoryId');
  }
  const minQuantity = readQuantity(body, 'minQuantity');
  const targetQuantity = (body['targetQuantity'] ?? null) === null ? null : readQuantity(body, 'targetQuantity');
  if (!isValidTarget(minQuantity, targetQuantity)) {
    throw new HttpError(400, 'targetQuantity must not be below minQuantity');
  }
  const product: UpdateProductRequest = {
    name: readText(body, 'name', PRODUCT_NAME_MAX_LENGTH),
    categoryId,
    unit: body['unit'] === undefined ? '' : readText(body, 'unit', UNIT_MAX_LENGTH, true),
    minQuantity,
    targetQuantity,
  };
  if (body['quantity'] !== undefined) {
    product.quantity = readQuantity(body, 'quantity');
  }
  return product;
}

function readId(params: Record<string, string>, notFound: string): number {
  const id = Number(params['id']);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(404, notFound);
  }
  return id;
}

function readProductId(params: Record<string, string>): number {
  return readId(params, 'Product not found');
}

// The ?before= of a history page: the id of the last event already shown.
function readBefore(query: URLSearchParams): number | null {
  const value = query.get('before');
  if (value === null) {
    return null;
  }
  const before = Number(value);
  if (!Number.isSafeInteger(before) || before <= 0) {
    throw new HttpError(400, 'Invalid before');
  }
  return before;
}

function productResponse(db: DatabaseSync, id: number): ProductResponse {
  const product = findProduct(db, id);
  if (product === null) {
    throw new HttpError(404, 'Product not found');
  }
  return { product };
}

export const productRoutes: readonly Route[] = [
  {
    method: 'GET',
    path: '/api/categories',
    handler: ({ db }) => {
      const body: CategoriesResponse = { categories: listCategories(db) };
      return ok(body);
    },
  },
  {
    method: 'POST',
    path: '/api/categories',
    handler: ({ db, body }) => {
      const name = readText(readObject(body), 'name', CATEGORY_NAME_MAX_LENGTH);
      if (categoryNameExists(db, name)) {
        throw new HttpError(409, 'Category already exists');
      }
      const response: CategoryResponse = { category: insertCategory(db, name) };
      return created(response);
    },
  },
  {
    method: 'PUT',
    path: '/api/categories/:id',
    handler: ({ db, params, body }) => {
      const id = readId(params, 'Category not found');
      const name = readText(readObject(body), 'name', CATEGORY_NAME_MAX_LENGTH);
      if (categoryNameExists(db, name, id)) {
        throw new HttpError(409, 'Category already exists');
      }
      const category = renameCategory(db, id, name);
      if (category === null) {
        throw new HttpError(404, 'Category not found');
      }
      const response: CategoryResponse = { category };
      return ok(response);
    },
  },
  {
    method: 'GET',
    path: '/api/products',
    handler: ({ db }) => {
      const body: ProductsResponse = { products: listProducts(db) };
      return ok(body);
    },
  },
  {
    method: 'POST',
    path: '/api/products',
    handler: (context) => {
      const { quantity, ...fields } = readProductRequest(context.db, context.body);
      if (quantity === undefined) {
        throw new HttpError(400, 'Missing or invalid field: quantity');
      }
      const product: ProductRequest = { ...fields, quantity };
      const user = currentUser(context);
      const response: ProductResponse = transaction(context.db, () => {
        const inserted = insertProduct(context.db, product, user.id);
        recordProductEvent(context.db, inserted.id, 'created', null, findProductSnapshot(context.db, inserted.id), user);
        return { product: inserted };
      });
      return created(response);
    },
  },
  {
    method: 'PUT',
    path: '/api/products/:id',
    handler: (context) => {
      const id = readProductId(context.params);
      const product = readProductRequest(context.db, context.body);
      const user = currentUser(context);
      transaction(context.db, () => {
        const before = findProductSnapshot(context.db, id);
        if (before === null || !updateProduct(context.db, id, product, user.id)) {
          throw new HttpError(404, 'Product not found');
        }
        recordProductEvent(context.db, id, 'edited', before, findProductSnapshot(context.db, id), user);
      });
      return ok(productResponse(context.db, id));
    },
  },
  {
    method: 'DELETE',
    path: '/api/products/:id',
    handler: (context) => {
      const id = readProductId(context.params);
      const user = currentUser(context);
      transaction(context.db, () => {
        const before = findProductSnapshot(context.db, id);
        if (before === null || !deleteProduct(context.db, id)) {
          throw new HttpError(404, 'Product not found');
        }
        recordProductEvent(context.db, id, 'deleted', before, null, user);
      });
      return noContent();
    },
  },
  {
    method: 'GET',
    path: '/api/products/frequent',
    handler: ({ db }) => {
      const since = new Date(Date.now() - FREQUENT_DAYS * 24 * 60 * 60 * 1000);
      const response: FrequentProductsResponse = { productIds: listFrequentProductIds(db, since) };
      return ok(response);
    },
  },
  {
    // A deleted product keeps its history.
    method: 'GET',
    path: '/api/products/:id/history',
    handler: ({ db, params, query }) => {
      const id = readProductId(params);
      if (findProduct(db, id) === null && !hasProductEvents(db, id)) {
        throw new HttpError(404, 'Product not found');
      }
      const response: ProductHistoryResponse = listProductEvents(db, id, readBefore(query));
      return ok(response);
    },
  },
  {
    // Quantities change by a delta rather than a new value, so that two people
    // taking a packet at the same time remove two packets. Reading and writing
    // run without awaiting in between, so no other request comes in between.
    method: 'POST',
    path: '/api/products/:id/adjust',
    handler: (context) => {
      const id = readProductId(context.params);
      const delta = readObject(context.body)['delta'];
      if (!isValidDelta(delta)) {
        throw new HttpError(400, 'Missing or invalid field: delta');
      }
      const { product } = productResponse(context.db, id);
      const quantity = applyAdjustment(product.quantity, delta);
      // A − at 0 changes nothing, so it is not recorded as a change either.
      if (quantity === product.quantity) {
        return ok({ product });
      }
      const user = currentUser(context);
      transaction(context.db, () => {
        const before = findProductSnapshot(context.db, id);
        updateQuantity(context.db, id, quantity, user.id);
        recordProductEvent(context.db, id, 'adjusted', before, findProductSnapshot(context.db, id), user);
      });
      return ok(productResponse(context.db, id));
    },
  },
];
