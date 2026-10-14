import type { DatabaseSync } from 'node:sqlite';

function rowToCheck(row: unknown): [number, number] {
  if (
    typeof row !== 'object' ||
    row === null ||
    !('product_id' in row) ||
    typeof row.product_id !== 'number' ||
    !('quantity' in row) ||
    typeof row.quantity !== 'number'
  ) {
    throw new Error('Unexpected shopping check row');
  }
  return [row.product_id, row.quantity];
}

// The bought quantity of each checked product.
export function listProductChecks(db: DatabaseSync): Map<number, number> {
  return new Map(db.prepare('SELECT product_id, quantity FROM shopping_checks').all().map(rowToCheck));
}

export function setProductCheck(db: DatabaseSync, productId: number, quantity: number): void {
  db.prepare(
    'INSERT INTO shopping_checks (product_id, quantity) VALUES (?, ?) ON CONFLICT (product_id) DO UPDATE SET quantity = excluded.quantity',
  ).run(productId, quantity);
}

export function deleteProductCheck(db: DatabaseSync, productId: number): void {
  db.prepare('DELETE FROM shopping_checks WHERE product_id = ?').run(productId);
}
