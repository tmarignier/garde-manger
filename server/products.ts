import type { DatabaseSync } from 'node:sqlite';
import { nameKey } from '../shared/accounts.ts';
import type { Category, Product, ProductRequest, ShopLink, UpdateProductRequest } from '../shared/types.ts';

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

function rowToShopLink(row: unknown): ShopLink & { productId: number } {
  if (
    !isRecord(row) ||
    typeof row['product_id'] !== 'number' ||
    typeof row['label'] !== 'string' ||
    typeof row['url'] !== 'string'
  ) {
    throw new Error('Unexpected shop link row');
  }
  return { productId: row['product_id'], label: row['label'], url: row['url'] };
}

// The shop links of every product, or of one product, in their order.
function listShopLinks(db: DatabaseSync, productId: number | null = null): Map<number, ShopLink[]> {
  const rows =
    productId === null
      ? db.prepare('SELECT product_id, label, url FROM shop_links ORDER BY product_id, position').all()
      : db.prepare('SELECT product_id, label, url FROM shop_links WHERE product_id = ? ORDER BY position').all(productId);
  const byProductId = new Map<number, ShopLink[]>();
  for (const row of rows) {
    const { productId: id, label, url } = rowToShopLink(row);
    const links = byProductId.get(id) ?? [];
    links.push({ label, url });
    byProductId.set(id, links);
  }
  return byProductId;
}

// Replaces the shop links of a product. Call it in a transaction.
function setShopLinks(db: DatabaseSync, productId: number, links: readonly ShopLink[]): void {
  db.prepare('DELETE FROM shop_links WHERE product_id = ?').run(productId);
  const insert = db.prepare('INSERT INTO shop_links (product_id, position, label, url) VALUES (?, ?, ?, ?)');
  links.forEach((link, position) => insert.run(productId, position, link.label, link.url));
}

function rowToProduct(row: unknown, shopLinks: Map<number, ShopLink[]>): Product {
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
    shopLinks: shopLinks.get(row['id']) ?? [],
    updatedByName: row['updated_by_name'],
    updatedAt: row['updated_at'],
  };
}

export function listProducts(db: DatabaseSync): Product[] {
  const shopLinks = listShopLinks(db);
  return db
    .prepare(`${PRODUCT_SELECT} ORDER BY products.name`)
    .all()
    .map((row) => rowToProduct(row, shopLinks));
}

export function findProduct(db: DatabaseSync, id: number): Product | null {
  const row: unknown = db.prepare(`${PRODUCT_SELECT} WHERE products.id = ?`).get(id);
  return row === undefined ? null : rowToProduct(row, listShopLinks(db, id));
}

// The id is never one of a deleted product, which SQLite could otherwise
// reuse: the new product would inherit the deleted one's history. Call it in a
// transaction, with the shop links.
export function insertProduct(db: DatabaseSync, product: ProductRequest, userId: number, now = new Date()): Product {
  const result = db
    .prepare(
      `INSERT INTO products
         (id, name, category_id, unit, quantity, min_quantity, target_quantity, updated_by, updated_at)
       VALUES (
         (SELECT max(coalesce((SELECT max(id) FROM products), 0), coalesce((SELECT max(product_id) FROM product_events), 0)) + 1),
         ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  const id = Number(result.lastInsertRowid);
  setShopLinks(db, id, product.shopLinks ?? []);
  const created = findProduct(db, id);
  if (created === null) {
    throw new Error('Inserted product not found');
  }
  return created;
}

// Returns false when the product does not exist. Without a quantity or shop
// links, the stored ones are kept. Call it in a transaction.
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
  if (result.changes === 0) {
    return false;
  }
  if (product.shopLinks !== undefined) {
    setShopLinks(db, id, product.shopLinks);
  }
  return true;
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
