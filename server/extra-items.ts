import type { DatabaseSync } from 'node:sqlite';
import type { ExtraItem } from '../shared/types.ts';

function rowToExtraItem(row: unknown): ExtraItem {
  if (
    typeof row !== 'object' ||
    row === null ||
    !('id' in row) ||
    typeof row.id !== 'number' ||
    !('name' in row) ||
    typeof row.name !== 'string'
  ) {
    throw new Error('Unexpected extra item row');
  }
  return { id: row.id, name: row.name };
}

// Extra items in the order they were added.
export function listExtraItems(db: DatabaseSync): ExtraItem[] {
  return db.prepare('SELECT id, name FROM extra_items ORDER BY id').all().map(rowToExtraItem);
}

export function insertExtraItem(db: DatabaseSync, name: string): ExtraItem {
  return rowToExtraItem(db.prepare('INSERT INTO extra_items (name) VALUES (?) RETURNING id, name').get(name));
}

export function deleteExtraItem(db: DatabaseSync, id: number): boolean {
  return db.prepare('DELETE FROM extra_items WHERE id = ?').run(id).changes > 0;
}
