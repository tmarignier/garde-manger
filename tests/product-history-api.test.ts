import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { migrate, migrations, openDatabase } from '../server/database.ts';
import { listFrequentProductIds } from '../server/product-history.ts';
import { createApp } from '../server/server.ts';
import type { Category, Product, ProductEvent, ProductHistoryResponse, ProductRequest, User } from '../shared/types.ts';
import { Device } from './helpers.ts';

describe('product history API', () => {
  let db: DatabaseSync;
  let server: Server;
  let admin: Device;
  let member: Device;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    server = createApp({ db, publicDir: '/nonexistent' });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    admin = new Device(baseUrl);
    assert.equal((await admin.request('POST', '/api/setup', { name: 'Thibault', password: 'admin-password' })).status, 200);
    assert.equal((await admin.request('POST', '/api/users', { name: 'Léa', password: 'lea-password' })).status, 201);
    member = new Device(baseUrl);
    assert.equal((await member.request('POST', '/api/login', { name: 'Léa', password: 'lea-password' })).status, 200);
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  const pasta: ProductRequest = {
    name: 'Pâtes',
    categoryId: null,
    unit: 'paquets',
    quantity: 1,
    minQuantity: 1,
    targetQuantity: null,
  };

  async function createProduct(device: Device, fields: Partial<ProductRequest> = {}): Promise<Product> {
    const response = await device.request('POST', '/api/products', { ...pasta, ...fields });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return (response.body as { product: Product }).product;
  }

  async function history(id: number, query = ''): Promise<ProductHistoryResponse> {
    const response = await admin.request('GET', `/api/products/${id}/history${query}`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body as ProductHistoryResponse;
  }

  // Oldest first, to read like the story of the product.
  async function story(id: number): Promise<Partial<ProductEvent>[]> {
    return (await history(id)).events
      .map(({ kind, userName, quantityBefore, quantityAfter, changes }) => ({
        kind,
        userName,
        quantityBefore,
        quantityAfter,
        changes,
      }))
      .reverse();
  }

  it('requires a session', async () => {
    const anonymous = new Device(admin.baseUrl);
    assert.equal((await anonymous.request('GET', '/api/products/1/history')).status, 401);
  });

  it('records who changed what in a product', async () => {
    const category = (await admin.request('POST', '/api/categories', { name: 'Épicerie' })).body as {
      category: Category;
    };
    const product = await createProduct(admin);
    assert.equal((await member.request('POST', `/api/products/${product.id}/adjust`, { delta: -1 })).status, 200);
    // A − at 0 changes nothing and records nothing.
    assert.equal((await member.request('POST', `/api/products/${product.id}/adjust`, { delta: -1 })).status, 200);
    assert.equal((await admin.request('POST', `/api/products/${product.id}/adjust`, { delta: 2 })).status, 200);
    const edit = { ...pasta, categoryId: category.category.id, minQuantity: 2, targetQuantity: 4 };
    delete (edit as Partial<ProductRequest>).quantity;
    assert.equal((await admin.request('PUT', `/api/products/${product.id}`, edit)).status, 200);
    // Saving the form again without changes records nothing.
    assert.equal((await admin.request('PUT', `/api/products/${product.id}`, edit)).status, 200);
    assert.equal((await member.request('PUT', `/api/products/${product.id}`, { ...edit, quantity: 3 })).status, 200);
    const purchase = { purchases: [{ productId: product.id, quantity: 1.5 }], extraItemIds: [] };
    assert.equal((await member.request('POST', '/api/shopping-list/purchases', purchase)).status, 200);

    assert.deepEqual(await story(product.id), [
      {
        kind: 'created',
        userName: 'Thibault',
        quantityBefore: null,
        quantityAfter: 1,
        changes: [
          { field: 'name', before: null, after: 'Pâtes' },
          { field: 'unit', before: null, after: 'paquets' },
          { field: 'minQuantity', before: null, after: 1 },
        ],
      },
      { kind: 'adjusted', userName: 'Léa', quantityBefore: 1, quantityAfter: 0, changes: [] },
      { kind: 'adjusted', userName: 'Thibault', quantityBefore: 0, quantityAfter: 2, changes: [] },
      {
        kind: 'edited',
        userName: 'Thibault',
        quantityBefore: null,
        quantityAfter: null,
        changes: [
          { field: 'categoryName', before: null, after: 'Épicerie' },
          { field: 'minQuantity', before: 1, after: 2 },
          { field: 'targetQuantity', before: null, after: 4 },
        ],
      },
      { kind: 'edited', userName: 'Léa', quantityBefore: 2, quantityAfter: 3, changes: [] },
      { kind: 'purchased', userName: 'Léa', quantityBefore: 3, quantityAfter: 4.5, changes: [] },
    ]);
  });

  it('keeps the history of a deleted product, and never gives its id to a new one', async () => {
    const product = await createProduct(admin);
    assert.equal((await member.request('DELETE', `/api/products/${product.id}`)).status, 204);
    const events = (await history(product.id)).events;
    assert.deepEqual(
      events.map((event) => [event.kind, event.userName, event.productName, event.quantityBefore]),
      [
        ['deleted', 'Léa', 'Pâtes', 1],
        ['created', 'Thibault', 'Pâtes', null],
      ],
    );
    const next = await createProduct(admin, { name: 'Riz' });
    assert.notEqual(next.id, product.id);
    assert.equal((await history(next.id)).events.length, 1);
  });

  it('keeps the name of a deleted account', async () => {
    const product = await createProduct(admin);
    assert.equal((await member.request('POST', `/api/products/${product.id}/adjust`, { delta: 1 })).status, 200);
    const users = (await admin.request('GET', '/api/users')).body as { users: User[] };
    const lea = users.users.find((user) => user.name === 'Léa');
    assert.ok(lea !== undefined);
    assert.equal((await admin.request('DELETE', `/api/users/${lea.id}`)).status, 204);
    assert.equal((await history(product.id)).events[0]?.userName, 'Léa');
  });

  it('records the category by its name at the time', async () => {
    const response = await admin.request('POST', '/api/categories', { name: 'Épicerie' });
    const category = (response.body as { category: Category }).category;
    const product = await createProduct(admin, { categoryId: category.id });
    assert.equal((await admin.request('PUT', `/api/categories/${category.id}`, { name: 'Épicerie salée' })).status, 200);
    const events = (await history(product.id)).events;
    assert.equal(events.length, 1);
    assert.deepEqual(
      events[0]?.changes.find((change) => change.field === 'categoryName'),
      { field: 'categoryName', before: null, after: 'Épicerie' },
    );
  });

  it('pages through the history, most recent first', async () => {
    const product = await createProduct(admin);
    for (let i = 0; i < 55; i++) {
      assert.equal((await admin.request('POST', `/api/products/${product.id}/adjust`, { delta: 1 })).status, 200);
    }
    const first = await history(product.id);
    assert.equal(first.events.length, 50);
    assert.equal(first.hasMore, true);
    assert.equal(first.events[0]?.quantityAfter, 56);
    const last = first.events.at(-1);
    assert.ok(last !== undefined);
    const second = await history(product.id, `?before=${last.id}`);
    assert.equal(second.events.length, 6);
    assert.equal(second.hasMore, false);
    assert.equal(second.events.at(-1)?.kind, 'created');
  });

  it('answers 404 for an unknown product and 400 for an invalid page', async () => {
    assert.equal((await admin.request('GET', '/api/products/999/history')).status, 404);
    const product = await createProduct(admin);
    assert.equal((await admin.request('GET', `/api/products/${product.id}/history?before=abc`)).status, 400);
  });

  it('records nothing for a refused change', async () => {
    const product = await createProduct(admin);
    const invalid = { ...pasta, minQuantity: 3, targetQuantity: 2 };
    assert.equal((await admin.request('PUT', `/api/products/${product.id}`, invalid)).status, 400);
    assert.equal((await admin.request('PUT', '/api/products/999', pasta)).status, 404);
    assert.equal((await admin.request('DELETE', '/api/products/999')).status, 404);
    assert.equal((await history(product.id)).events.length, 1);
    assert.equal((await admin.request('GET', '/api/products/999/history')).status, 404);
  });

  it('lists the products adjusted at least twice, most adjusted first', async () => {
    const pasta = await createProduct(admin);
    const rice = await createProduct(admin, { name: 'Riz' });
    const salt = await createProduct(admin, { name: 'Sel' });
    const sugar = await createProduct(admin, { name: 'Sucre' });
    for (const [product, times] of [[rice, 2], [pasta, 3], [salt, 1], [sugar, 2]] as const) {
      for (let i = 0; i < times; i++) {
        assert.equal((await member.request('POST', `/api/products/${product.id}/adjust`, { delta: 1 })).status, 200);
      }
    }
    // A deleted product is no longer offered.
    assert.equal((await admin.request('DELETE', `/api/products/${sugar.id}`)).status, 204);
    // Edits and purchases do not count, only + and −.
    assert.equal((await admin.request('PUT', `/api/products/${salt.id}`, { ...pasta, name: 'Sel fin' })).status, 200);

    const response = await member.request('GET', '/api/products/frequent');
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body, { productIds: [pasta.id, rice.id] });
  });

  it('only counts the adjustments since the given date', async () => {
    const pasta = await createProduct(admin);
    for (let i = 0; i < 2; i++) {
      assert.equal((await admin.request('POST', `/api/products/${pasta.id}/adjust`, { delta: 1 })).status, 200);
    }
    assert.deepEqual(listFrequentProductIds(db, new Date(Date.now() - 60_000)), [pasta.id]);
    assert.deepEqual(listFrequentProductIds(db, new Date(Date.now() + 60_000)), []);
    assert.deepEqual(listFrequentProductIds(db, new Date(0), { minAdjustments: 3 }), []);
  });

});

describe('product history migration', () => {
  it('adds the history to a database of version 4 and keeps its products', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, migrations.slice(0, 4));
    db.prepare("INSERT INTO products (name, quantity) VALUES ('Pâtes', 2)").run();
    migrate(db);
    assert.deepEqual(
      db.prepare('SELECT name, quantity FROM products').all().map((row) => ({ ...row })),
      [{ name: 'Pâtes', quantity: 2 }],
    );
    assert.deepEqual({ ...db.prepare('SELECT count(*) AS count FROM product_events').get() }, { count: 0 });
    db.close();
  });
});
