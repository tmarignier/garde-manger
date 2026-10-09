import type { DatabaseSync } from 'node:sqlite';
import {
  CATEGORY_NAME_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  UNIT_MAX_LENGTH,
  applyAdjustment,
  isValidDelta,
  isValidQuantity,
  normalizeText,
  roundQuantity,
} from '../shared/products.ts';
import type {
  CategoriesResponse,
  CategoryResponse,
  ProductRequest,
  ProductResponse,
  ProductsResponse,
} from '../shared/types.ts';
import { HttpError, readObject, readString } from './http.ts';
import {
  categoryExists,
  categoryNameExists,
  deleteProduct,
  findProduct,
  insertCategory,
  insertProduct,
  listCategories,
  listProducts,
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

function readProductRequest(db: DatabaseSync, rawBody: unknown): ProductRequest {
  const body = readObject(rawBody);
  const categoryId = body['categoryId'] ?? null;
  if (categoryId !== null && (typeof categoryId !== 'number' || !categoryExists(db, categoryId))) {
    throw new HttpError(400, 'Missing or invalid field: categoryId');
  }
  const targetQuantity = body['targetQuantity'] ?? null;
  return {
    name: readText(body, 'name', PRODUCT_NAME_MAX_LENGTH),
    categoryId,
    unit: body['unit'] === undefined ? '' : readText(body, 'unit', UNIT_MAX_LENGTH, true),
    quantity: readQuantity(body, 'quantity'),
    minQuantity: readQuantity(body, 'minQuantity'),
    targetQuantity: targetQuantity === null ? null : readQuantity(body, 'targetQuantity'),
  };
}

function readProductId(params: Record<string, string>): number {
  const id = Number(params['id']);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(404, 'Product not found');
  }
  return id;
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
      const product = readProductRequest(context.db, context.body);
      const response: ProductResponse = { product: insertProduct(context.db, product, currentUser(context).id) };
      return created(response);
    },
  },
  {
    method: 'PUT',
    path: '/api/products/:id',
    handler: (context) => {
      const id = readProductId(context.params);
      const product = readProductRequest(context.db, context.body);
      if (!updateProduct(context.db, id, product, currentUser(context).id)) {
        throw new HttpError(404, 'Product not found');
      }
      return ok(productResponse(context.db, id));
    },
  },
  {
    method: 'DELETE',
    path: '/api/products/:id',
    handler: ({ db, params }) => {
      if (!deleteProduct(db, readProductId(params))) {
        throw new HttpError(404, 'Product not found');
      }
      return noContent();
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
      updateQuantity(context.db, id, applyAdjustment(product.quantity, delta), currentUser(context).id);
      return ok(productResponse(context.db, id));
    },
  },
];
