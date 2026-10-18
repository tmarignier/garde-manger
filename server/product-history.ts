import type { DatabaseSync } from 'node:sqlite';
import { isProductChange, isProductEventKind, productEventFields } from '../shared/product-history.ts';
import type { ProductSnapshot } from '../shared/product-history.ts';
import type { ProductEvent, ProductEventKind, ProductHistoryResponse, User } from '../shared/types.ts';

export const HISTORY_PAGE_SIZE = 50;

// What makes a product frequent: adjusted at least twice in the last 30 days.
// The list keeps the 15 most adjusted.
export const FREQUENT_DAYS = 30;
const FREQUENT_MIN_ADJUSTMENTS = 2;
const FREQUENT_LIMIT = 15;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function rowToSnapshot(row: unknown): ProductSnapshot {
  if (
    !isRecord(row) ||
    typeof row['name'] !== 'string' ||
    (row['category_name'] !== null && typeof row['category_name'] !== 'string') ||
    typeof row['unit'] !== 'string' ||
    typeof row['quantity'] !== 'number' ||
    typeof row['min_quantity'] !== 'number' ||
    (row['target_quantity'] !== null && typeof row['target_quantity'] !== 'number')
  ) {
    throw new Error('Unexpected product snapshot row');
  }
  return {
    name: row['name'],
    categoryName: row['category_name'],
    unit: row['unit'],
    quantity: row['quantity'],
    minQuantity: row['min_quantity'],
    targetQuantity: row['target_quantity'],
  };
}

// The product as its history records it, or null when it does not exist.
export function findProductSnapshot(db: DatabaseSync, id: number): ProductSnapshot | null {
  const row: unknown = db
    .prepare(
      `SELECT products.name, categories.name AS category_name, products.unit, products.quantity,
         products.min_quantity, products.target_quantity
       FROM products LEFT JOIN categories ON categories.id = products.category_id
       WHERE products.id = ?`,
    )
    .get(id);
  return row === undefined ? null : rowToSnapshot(row);
}

// Records the change of a product from `before` to `after` (null before its
// creation, null after its deletion). Call it in the same transaction as the
// change itself. Nothing is recorded when nothing changed.
export function recordProductEvent(
  db: DatabaseSync,
  productId: number,
  kind: ProductEventKind,
  before: ProductSnapshot | null,
  after: ProductSnapshot | null,
  user: User,
  now = new Date(),
): void {
  const fields = productEventFields(before, after);
  const productName = after?.name ?? before?.name;
  if (fields === null || productName === undefined) {
    return;
  }
  db.prepare(
    `INSERT INTO product_events
       (product_id, product_name, user_id, user_name, kind, quantity_before, quantity_after, changes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    productId,
    productName,
    user.id,
    user.name,
    kind,
    fields.quantityBefore,
    fields.quantityAfter,
    JSON.stringify(fields.changes),
    now.toISOString(),
  );
}

function rowToProductEvent(row: unknown): ProductEvent {
  if (
    !isRecord(row) ||
    typeof row['id'] !== 'number' ||
    typeof row['product_id'] !== 'number' ||
    typeof row['product_name'] !== 'string' ||
    typeof row['user_name'] !== 'string' ||
    !isProductEventKind(row['kind']) ||
    (row['quantity_before'] !== null && typeof row['quantity_before'] !== 'number') ||
    (row['quantity_after'] !== null && typeof row['quantity_after'] !== 'number') ||
    typeof row['changes'] !== 'string' ||
    typeof row['created_at'] !== 'string'
  ) {
    throw new Error('Unexpected product event row');
  }
  const changes: unknown = JSON.parse(row['changes']);
  if (!Array.isArray(changes) || !changes.every(isProductChange)) {
    throw new Error('Unexpected product event changes');
  }
  return {
    id: row['id'],
    productId: row['product_id'],
    productName: row['product_name'],
    userName: row['user_name'],
    kind: row['kind'],
    quantityBefore: row['quantity_before'],
    quantityAfter: row['quantity_after'],
    changes,
    createdAt: row['created_at'],
  };
}

// The events of a product, most recent first, older than the event `before`
// when given.
export function listProductEvents(
  db: DatabaseSync,
  productId: number,
  before: number | null = null,
  limit = HISTORY_PAGE_SIZE,
): ProductHistoryResponse {
  const rows = db
    .prepare(
      `SELECT id, product_id, product_name, user_name, kind, quantity_before, quantity_after, changes, created_at
       FROM product_events
       WHERE product_id = ? AND (? IS NULL OR id < ?)
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(productId, before, before, limit + 1);
  return { events: rows.slice(0, limit).map(rowToProductEvent), hasMore: rows.length > limit };
}

export function hasProductEvents(db: DatabaseSync, productId: number): boolean {
  return db.prepare('SELECT 1 FROM product_events WHERE product_id = ?').get(productId) !== undefined;
}

// The products the family uses most: those adjusted with + or − at least
// `minAdjustments` times since `since`, most adjusted first. Deleted products
// are left out.
export function listFrequentProductIds(
  db: DatabaseSync,
  since: Date,
  options: { minAdjustments?: number; limit?: number } = {},
): number[] {
  const { minAdjustments = FREQUENT_MIN_ADJUSTMENTS, limit = FREQUENT_LIMIT } = options;
  return db
    .prepare(
      `SELECT product_events.product_id
       FROM product_events JOIN products ON products.id = product_events.product_id
       WHERE product_events.kind = 'adjusted' AND product_events.created_at >= ?
       GROUP BY product_events.product_id
       HAVING count(*) >= ?
       ORDER BY count(*) DESC, max(product_events.id) DESC
       LIMIT ?`,
    )
    .all(since.toISOString(), minAdjustments, limit)
    .map((row) => {
      if (!isRecord(row) || typeof row['product_id'] !== 'number') {
        throw new Error('Unexpected frequent product row');
      }
      return row['product_id'];
    });
}
