import type { DatabaseSync } from 'node:sqlite';
import { nameKey } from '../shared/accounts.ts';
import type { Category, Product, ProductRequest, UpdateProductRequest } from '../shared/types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function rowToCategory(row: unknown): Category {
  if (
    !isRecord(row) ||
    typeof row['id'] !== 'number' ||
    typeof row['name'] !== 'string' ||
    typeof row['position'] !== 'number'
  ) {
    throw new Error('Unexpected category row');
  }
  return { id: row['id'], name: row['name'], position: row['position'] };
}

export function listCategories(db: DatabaseSync): Category[] {
  return db.prepare('SELECT id, name, position FROM categories ORDER BY position, name').all().map(rowToCategory);
}

export function categoryExists(db: DatabaseSync, id: number): boolean {
  return db.prepare('SELECT 1 FROM categories WHERE id = ?').get(id) !== undefined;
}

// A category being renamed may keep its own name with another case
// ('epicerie' to 'Épicerie' is not a duplicate of itself).
export function categoryNameExists(db: DatabaseSync, name: string, exceptId: number | null = null): boolean {
  return (
    db.prepare('SELECT 1 FROM categories WHERE name_key = ? AND id IS NOT ?').get(nameKey(name), exceptId) !==
    undefined
  );
}

// New categories go to the end of the list.
export function insertCategory(db: DatabaseSync, name: string): Category {
  const row: unknown = db
    .prepare(
      `INSERT INTO categories (name, name_key, position)
       VALUES (?, ?, (SELECT coalesce(max(position), -1) + 1 FROM categories))
       RETURNING id, name, position`,
    )
    .get(name, nameKey(name));
  return rowToCategory(row);
}

// Renaming a category renames it for all its products, which refer to it by id.
// Returns null when the category does not exist.
export function renameCategory(db: DatabaseSync, id: number, name: string): Category | null {
  const row: unknown = db
    .prepare('UPDATE categories SET name = ?, name_key = ? WHERE id = ? RETURNING id, name, position')
    .get(name, nameKey(name), id);
  return row === undefined ? null : rowToCategory(row);
}

const PRODUCT_SELECT = `
  SELECT products.id, products.name, products.category_id, products.unit, products.quantity,
    products.min_quantity, products.target_quantity, users.name AS updated_by_name, products.updated_at
  FROM products LEFT JOIN users ON users.id = products.updated_by`;

function rowToProduct(row: unknown): Product {
  if (
    !isRecord(row) ||
    typeof row['id'] !== 'number' ||
    typeof row['name'] !== 'string' ||
    (row['category_id'] !== null && typeof row['category_id'] !== 'number') ||
    typeof row['unit'] !== 'string' ||
    typeof row['quantity'] !== 'number' ||
    typeof row['min_quantity'] !== 'number' ||
    (row['target_quantity'] !== null && typeof row['target_quantity'] !== 'number') ||
    (row['updated_by_name'] !== null && typeof row['updated_by_name'] !== 'string') ||
    typeof row['updated_at'] !== 'string'
  ) {
    throw new Error('Unexpected product row');
  }
  return {
    id: row['id'],
    name: row['name'],
    categoryId: row['category_id'],
    unit: row['unit'],
    quantity: row['quantity'],
    minQuantity: row['min_quantity'],
    targetQuantity: row['target_quantity'],
    updatedByName: row['updated_by_name'],
    updatedAt: row['updated_at'],
  };
}

export function listProducts(db: DatabaseSync): Product[] {
  return db.prepare(`${PRODUCT_SELECT} ORDER BY products.name`).all().map(rowToProduct);
}

export function findProduct(db: DatabaseSync, id: number): Product | null {
  const row: unknown = db.prepare(`${PRODUCT_SELECT} WHERE products.id = ?`).get(id);
  return row === undefined ? null : rowToProduct(row);
}

export function insertProduct(db: DatabaseSync, product: ProductRequest, userId: number, now = new Date()): Product {
  const result = db
    .prepare(
      `INSERT INTO products
         (name, category_id, unit, quantity, min_quantity, target_quantity, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      product.name,
      product.categoryId,
      product.unit,
      product.quantity,
      product.minQuantity,
      product.targetQuantity,
      userId,
      now.toISOString(),
    );
  const created = findProduct(db, Number(result.lastInsertRowid));
  if (created === null) {
    throw new Error('Inserted product not found');
  }
  return created;
}

// Returns false when the product does not exist. Without a quantity, the
// stored quantity is kept.
export function updateProduct(
  db: DatabaseSync,
  id: number,
  product: UpdateProductRequest,
  userId: number,
  now = new Date(),
): boolean {
  const result = db
    .prepare(
      `UPDATE products SET name = ?, category_id = ?, unit = ?, quantity = coalesce(?, quantity), min_quantity = ?,
         target_quantity = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      product.name,
      product.categoryId,
      product.unit,
      product.quantity ?? null,
      product.minQuantity,
      product.targetQuantity,
      userId,
      now.toISOString(),
      id,
    );
  return result.changes > 0;
}

export function updateQuantity(db: DatabaseSync, id: number, quantity: number, userId: number, now = new Date()): void {
  db.prepare('UPDATE products SET quantity = ?, updated_by = ?, updated_at = ? WHERE id = ?').run(
    quantity,
    userId,
    now.toISOString(),
    id,
  );
}

export function deleteProduct(db: DatabaseSync, id: number): boolean {
  return db.prepare('DELETE FROM products WHERE id = ?').run(id).changes > 0;
}
