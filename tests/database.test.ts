import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { getSchemaVersion, migrate, migrations, openDatabase } from '../server/database.ts';

function tableNames(db: DatabaseSync): string[] {
  const rows: unknown[] = db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
    .all();
  return rows.map((row) => {
    assert.ok(typeof row === 'object' && row !== null && 'name' in row && typeof row.name === 'string');
    return row.name;
  });
}

describe('openDatabase', () => {
  it('creates every table of the data model', () => {
    const db = openDatabase(':memory:');
    assert.deepEqual(tableNames(db), [
      'categories',
      'extra_items',
      'product_events',
      'products',
      'sessions',
      'shop_links',
      'shopping_checks',
      'users',
    ]);
    assert.equal(getSchemaVersion(db), migrations.length);
    db.close();
  });

  it('enforces foreign keys', () => {
    const db = openDatabase(':memory:');
    assert.throws(
      () => db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run('token', 999, '2030-01-01'),
      /FOREIGN KEY constraint failed/,
    );
    db.close();
  });
});

describe('migrate', () => {
  it('applies pending migrations in order and records the version', () => {
    const db = new DatabaseSync(':memory:');
    const steps = ['CREATE TABLE a (id INTEGER)', 'CREATE TABLE b (id INTEGER)'];

    migrate(db, steps.slice(0, 1));
    assert.equal(getSchemaVersion(db), 1);
    assert.deepEqual(tableNames(db), ['a']);

    migrate(db, steps);
    assert.equal(getSchemaVersion(db), 2);
    assert.deepEqual(tableNames(db), ['a', 'b']);
    db.close();
  });

  it('does nothing when the schema is up to date', () => {
    const db = openDatabase(':memory:');
    assert.doesNotThrow(() => migrate(db));
    assert.equal(getSchemaVersion(db), migrations.length);
    db.close();
  });

  it('rolls back a failing migration', () => {
    const db = new DatabaseSync(':memory:');
    assert.throws(() => migrate(db, ['CREATE TABLE a (id INTEGER); CREATE TABLE a (id INTEGER)']));
    assert.equal(getSchemaVersion(db), 0);
    assert.deepEqual(tableNames(db), []);
    db.close();
  });

  it('keeps existing products and extra items when adding shopping checks', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db, migrations.slice(0, 5));
    db.exec("INSERT INTO products (name, quantity, min_quantity) VALUES ('Pâtes', 0, 2)");
    db.exec("INSERT INTO extra_items (name) VALUES ('Bougies')");
    migrate(db);
    assert.deepEqual({ ...db.prepare('SELECT name, checked FROM extra_items').get() }, { name: 'Bougies', checked: 0 });
    db.exec('INSERT INTO shopping_checks (product_id, quantity) VALUES (1, 2)');
    assert.throws(() => db.exec('INSERT INTO shopping_checks (product_id, quantity) VALUES (999, 1)'), /FOREIGN KEY/);
    db.exec('DELETE FROM products');
    assert.deepEqual(db.prepare('SELECT * FROM shopping_checks').all(), []);
    db.close();
  });

  it('refuses a database newer than the application', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA user_version = 5');
    assert.throws(() => migrate(db, ['SELECT 1']), /newer than this application/);
    db.close();
  });
});
