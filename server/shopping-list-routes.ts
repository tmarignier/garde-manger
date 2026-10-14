import type { DatabaseSync } from 'node:sqlite';
import { PRODUCT_NAME_MAX_LENGTH, applyAdjustment, isValidDelta, normalizeText, roundQuantity } from '../shared/products.ts';
import type { ExtraItemResponse, Purchase, PurchasesRequest, ShoppingListResponse } from '../shared/types.ts';
import { transaction } from './database.ts';
import { deleteExtraItem, insertExtraItem, listExtraItems, setExtraItemChecked } from './extra-items.ts';
import { HttpError, readObject, readString } from './http.ts';
import { findProductSnapshot, recordProductEvent } from './product-history.ts';
import { findProduct, listProducts, updateQuantity } from './products.ts';
import { created, currentUser, noContent, ok } from './router.ts';
import type { Route } from './router.ts';
import { deleteProductCheck, listProductChecks, setProductCheck } from './shopping-checks.ts';
import { computeShoppingList } from './shopping-list.ts';

// More than any real shopping trip, to bound the work of one request.
const MAX_PURCHASES = 1000;

function shoppingList(db: DatabaseSync): ShoppingListResponse {
  return { items: computeShoppingList(listProducts(db), listProductChecks(db)), extraItems: listExtraItems(db) };
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function readArray(body: Record<string, unknown>, key: string): unknown[] {
  const value = body[key] ?? [];
  if (!Array.isArray(value) || value.length > MAX_PURCHASES) {
    throw new HttpError(400, `Missing or invalid field: ${key}`);
  }
  return value;
}

function readPurchasesRequest(rawBody: unknown): PurchasesRequest {
  const body = readObject(rawBody);
  const purchases: Purchase[] = readArray(body, 'purchases').map((value) => {
    const { productId, quantity } = readObject(value);
    if (!isId(productId) || !isValidDelta(quantity) || quantity <= 0) {
      throw new HttpError(400, 'Invalid purchase');
    }
    return { productId, quantity: roundQuantity(quantity) };
  });
  if (new Set(purchases.map((purchase) => purchase.productId)).size !== purchases.length) {
    throw new HttpError(400, 'Each product can only be bought once per request');
  }
  const extraItemIds = readArray(body, 'extraItemIds');
  if (!extraItemIds.every(isId)) {
    throw new HttpError(400, 'Missing or invalid field: extraItemIds');
  }
  return { purchases, extraItemIds };
}

function readExtraItemId(params: Record<string, string>): number {
  const id = Number(params['id']);
  if (!isId(id)) {
    throw new HttpError(404, 'Extra item not found');
  }
  return id;
}

function readProductId(params: Record<string, string>): number {
  const id = Number(params['productId']);
  if (!isId(id)) {
    throw new HttpError(404, 'Product not found');
  }
  return id;
}

export const shoppingListRoutes: readonly Route[] = [
  {
    method: 'GET',
    path: '/api/shopping-list',
    handler: ({ db }) => ok(shoppingList(db)),
  },
  {
    // Checks a product as bought, or changes its bought quantity.
    method: 'PUT',
    path: '/api/shopping-list/checks/:productId',
    handler: ({ db, params, body }) => {
      const productId = readProductId(params);
      const { quantity } = readObject(body);
      if (!isValidDelta(quantity) || roundQuantity(quantity) <= 0) {
        throw new HttpError(400, 'Missing or invalid field: quantity');
      }
      if (findProduct(db, productId) === null) {
        throw new HttpError(404, 'Product not found');
      }
      setProductCheck(db, productId, roundQuantity(quantity));
      return noContent();
    },
  },
  {
    // Unchecking twice, from two phones, is not an error.
    method: 'DELETE',
    path: '/api/shopping-list/checks/:productId',
    handler: ({ db, params }) => {
      deleteProductCheck(db, readProductId(params));
      return noContent();
    },
  },
  {
    // Bought quantities are added to the current stock, like a +, so that a
    // change made at home during the shopping trip is kept. Products or extra
    // items deleted meanwhile are skipped. The checks of the bought products
    // are removed with them.
    method: 'POST',
    path: '/api/shopping-list/purchases',
    handler: (context) => {
      const { purchases, extraItemIds } = readPurchasesRequest(context.body);
      const user = currentUser(context);
      const now = new Date();
      transaction(context.db, () => {
        for (const purchase of purchases) {
          deleteProductCheck(context.db, purchase.productId);
          const product = findProduct(context.db, purchase.productId);
          if (product !== null) {
            const before = findProductSnapshot(context.db, product.id);
            updateQuantity(context.db, product.id, applyAdjustment(product.quantity, purchase.quantity), user.id, now);
            const after = findProductSnapshot(context.db, product.id);
            recordProductEvent(context.db, product.id, 'purchased', before, after, user, now);
          }
        }
        for (const id of extraItemIds) {
          deleteExtraItem(context.db, id);
        }
      });
      return ok(shoppingList(context.db));
    },
  },
  {
    method: 'POST',
    path: '/api/extra-items',
    handler: ({ db, body }) => {
      const name = normalizeText(readString(readObject(body), 'name'), PRODUCT_NAME_MAX_LENGTH);
      if (name === null) {
        throw new HttpError(400, 'Invalid name');
      }
      const response: ExtraItemResponse = { extraItem: insertExtraItem(db, name) };
      return created(response);
    },
  },
  {
    method: 'DELETE',
    path: '/api/extra-items/:id',
    handler: ({ db, params }) => {
      if (!deleteExtraItem(db, readExtraItemId(params))) {
        throw new HttpError(404, 'Extra item not found');
      }
      return noContent();
    },
  },
  {
    method: 'PUT',
    path: '/api/extra-items/:id/check',
    handler: ({ db, params }) => {
      if (!setExtraItemChecked(db, readExtraItemId(params), true)) {
        throw new HttpError(404, 'Extra item not found');
      }
      return noContent();
    },
  },
  {
    method: 'DELETE',
    path: '/api/extra-items/:id/check',
    handler: ({ db, params }) => {
      if (!setExtraItemChecked(db, readExtraItemId(params), false)) {
        throw new HttpError(404, 'Extra item not found');
      }
      return noContent();
    },
  },
];
