import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { openDatabase } from '../server/database.ts';
import { createApp } from '../server/server.ts';
import type { Category, Product, ProductRequest } from '../shared/types.ts';
import { Device } from './helpers.ts';

describe('products API', () => {
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

  async function createCategory(device: Device, name: string): Promise<Category> {
    const response = await device.request('POST', '/api/categories', { name });
    assert.equal(response.status, 201);
    return (response.body as { category: Category }).category;
  }

  async function createProduct(device: Device, fields: Partial<ProductRequest> = {}): Promise<Product> {
    const body: ProductRequest = {
      name: 'Pâtes',
      categoryId: null,
      unit: 'paquets',
      quantity: 2,
      minQuantity: 1,
      targetQuantity: null,
      ...fields,
    };
    const response = await device.request('POST', '/api/products', body);
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return (response.body as { product: Product }).product;
  }

  async function adjust(device: Device, id: number, delta: unknown): Promise<{ status: number; product: Product }> {
    const response = await device.request('POST', `/api/products/${id}/adjust`, { delta });
    return { status: response.status, product: (response.body as { product: Product }).product };
  }

  it('requires a session', async () => {
    const anonymous = new Device(admin.baseUrl);
    assert.equal((await anonymous.request('GET', '/api/products')).status, 401);
    assert.equal((await anonymous.request('GET', '/api/categories')).status, 401);
    assert.equal((await anonymous.request('POST', '/api/products/1/adjust', { delta: 1 })).status, 401);
  });

  it('adds categories at the end of the list and refuses duplicates', async () => {
    await createCategory(admin, 'Épicerie salée');
    await createCategory(member, ' Boissons ');
    const list = await admin.request('GET', '/api/categories');
    assert.deepEqual(
      (list.body as { categories: Category[] }).categories.map((category) => [category.name, category.position]),
      [
        ['Épicerie salée', 0],
        ['Boissons', 1],
      ],
    );
    assert.equal((await admin.request('POST', '/api/categories', { name: 'ÉPICERIE SALÉE' })).status, 409);
    assert.equal((await admin.request('POST', '/api/categories', { name: '  ' })).status, 400);
  });

  it('renames a category for all its products', async () => {
    const category = await createCategory(admin, 'Epicerie');
    const drinks = await createCategory(admin, 'Boissons');
    const product = await createProduct(admin, { categoryId: category.id });

    const renamed = await member.request('PUT', `/api/categories/${category.id}`, { name: ' Épicerie salée ' });
    assert.equal(renamed.status, 200);
    assert.deepEqual((renamed.body as { category: Category }).category, {
      id: category.id,
      name: 'Épicerie salée',
      position: 0,
    });
    const products = (await admin.request('GET', '/api/products')).body as { products: Product[] };
    assert.equal(products.products.find((existing) => existing.id === product.id)?.categoryId, category.id);
    const list = (await admin.request('GET', '/api/categories')).body as { categories: Category[] };
    assert.deepEqual(
      list.categories.map((existing) => existing.name),
      ['Épicerie salée', 'Boissons'],
    );

    // Changing only the case is not a duplicate of itself.
    assert.equal((await admin.request('PUT', `/api/categories/${category.id}`, { name: 'ÉPICERIE SALÉE' })).status, 200);
    assert.equal((await admin.request('PUT', `/api/categories/${drinks.id}`, { name: 'épicerie salée' })).status, 409);
    assert.equal((await admin.request('PUT', `/api/categories/${drinks.id}`, { name: ' ' })).status, 400);
    assert.equal((await admin.request('PUT', '/api/categories/999', { name: 'Hygiène' })).status, 404);
    assert.equal((await admin.request('PUT', '/api/categories/abc', { name: 'Hygiène' })).status, 404);
    const anonymous = new Device(admin.baseUrl);
    assert.equal((await anonymous.request('PUT', `/api/categories/${drinks.id}`, { name: 'Hygiène' })).status, 401);
  });

  it('adds a product and records who added it', async () => {
    const category = await createCategory(admin, 'Épicerie salée');
    const created = await createProduct(member, {
      name: ' Pâtes ',
      categoryId: category.id,
      quantity: 1.5,
      targetQuantity: 4,
    });
    assert.deepEqual(
      { ...created, updatedAt: '' },
      {
        id: created.id,
        name: 'Pâtes',
        categoryId: category.id,
        unit: 'paquets',
        quantity: 1.5,
        minQuantity: 1,
        targetQuantity: 4,
        shopLinks: [],
        updatedByName: 'Léa',
        updatedAt: '',
      },
    );
    const list = await admin.request('GET', '/api/products');
    assert.deepEqual((list.body as { products: Product[] }).products, [created]);
  });

  it('validates products', async () => {
    const valid = { name: 'Riz', categoryId: null, unit: '', quantity: 1, minQuantity: 0, targetQuantity: null };
    const invalid = [
      undefined,
      { ...valid, name: '' },
      { ...valid, name: 'x'.repeat(101) },
      { ...valid, categoryId: 42 },
      { ...valid, categoryId: '1' },
      { ...valid, quantity: -1 },
      { ...valid, quantity: '2' },
      { ...valid, quantity: undefined },
      { ...valid, minQuantity: undefined },
      { ...valid, minQuantity: 3, targetQuantity: 2 },
      { ...valid, targetQuantity: -2 },
      { ...valid, unit: 3 },
      { ...valid, shopLinks: 'https://lafourche.fr/pates' },
      { ...valid, shopLinks: [{ url: 'pates' }] },
      { ...valid, shopLinks: [{ url: 'javascript:alert(1)' }] },
      { ...valid, shopLinks: [{ url: 42 }] },
      { ...valid, shopLinks: [{ url: 'https://lafourche.fr/pates', label: 'x'.repeat(51) }] },
      { ...valid, shopLinks: Array.from({ length: 11 }, () => ({ url: 'https://lafourche.fr/pates' })) },
    ];
    for (const body of invalid) {
      assert.equal((await admin.request('POST', '/api/products', body)).status, 400, JSON.stringify(body));
    }
    // Unit and target quantity are optional.
    const { unit: _unit, targetQuantity: _target, ...minimal } = valid;
    assert.equal((await admin.request('POST', '/api/products', minimal)).status, 201);
  });

  it('edits a product and records who changed it', async () => {
    const created = await createProduct(admin);
    const category = await createCategory(admin, 'Épicerie salée');
    const response = await member.request('PUT', `/api/products/${created.id}`, {
      name: 'Pâtes complètes',
      categoryId: category.id,
      unit: 'paquets',
      quantity: 3,
      minQuantity: 2,
      targetQuantity: 5,
    });
    assert.equal(response.status, 200);
    const updated = (response.body as { product: Product }).product;
    assert.equal(updated.name, 'Pâtes complètes');
    assert.equal(updated.categoryId, category.id);
    assert.equal(updated.quantity, 3);
    assert.equal(updated.targetQuantity, 5);
    assert.equal(updated.updatedByName, 'Léa');

    const missing = await admin.request('PUT', '/api/products/999', { ...updated, categoryId: null });
    assert.equal(missing.status, 404);
  });

  it('keeps the stock when an edit does not send the quantity', async () => {
    const created = await createProduct(admin, { quantity: 2 });
    await adjust(member, created.id, -1);
    const { quantity: _quantity, ...fields } = created;
    const response = await admin.request('PUT', `/api/products/${created.id}`, { ...fields, name: 'Spaghetti' });
    assert.equal(response.status, 200);
    const updated = (response.body as { product: Product }).product;
    assert.equal(updated.name, 'Spaghetti');
    assert.equal(updated.quantity, 1);
  });

  it('saves, keeps and removes the links to the product on online shops', async () => {
    const created = await createProduct(admin, {
      shopLinks: [
        { label: ' Barilla 500 g ', url: ' https://www.lafourche.fr/products/barilla ' },
        { label: '', url: 'lafourche.fr/products/pates-bio' },
      ],
    });
    const links = [
      { label: 'Barilla 500 g', url: 'https://www.lafourche.fr/products/barilla' },
      { label: '', url: 'https://lafourche.fr/products/pates-bio' },
    ];
    assert.deepEqual(created.shopLinks, links);
    const { shopLinks: _shopLinks, ...fields } = created;

    // An edit without the links keeps them.
    const kept = await member.request('PUT', `/api/products/${created.id}`, { ...fields, name: 'Spaghetti' });
    assert.deepEqual((kept.body as { product: Product }).product.shopLinks, links);

    const reordered = await member.request('PUT', `/api/products/${created.id}`, {
      ...fields,
      shopLinks: [links[1], { url: 'https://lafourche.fr/products/rummo' }],
    });
    assert.deepEqual((reordered.body as { product: Product }).product.shopLinks, [
      links[1],
      { label: '', url: 'https://lafourche.fr/products/rummo' },
    ]);
    const list = await admin.request('GET', '/api/products');
    assert.deepEqual((list.body as { products: Product[] }).products[0]?.shopLinks.length, 2);

    const removed = await member.request('PUT', `/api/products/${created.id}`, { ...fields, shopLinks: [] });
    assert.deepEqual((removed.body as { product: Product }).product.shopLinks, []);
  });

  it('deletes the links of a deleted product', async () => {
    const created = await createProduct(admin, { shopLinks: [{ label: '', url: 'https://lafourche.fr/p' }] });
    assert.equal((await admin.request('DELETE', `/api/products/${created.id}`)).status, 204);
    assert.equal(db.prepare('SELECT count(*) AS count FROM shop_links').get()?.['count'], 0);
  });

  it('deletes a product', async () => {
    const created = await createProduct(admin);
    assert.equal((await member.request('DELETE', `/api/products/${created.id}`)).status, 204);
    assert.equal((await member.request('DELETE', `/api/products/${created.id}`)).status, 404);
    assert.deepEqual((await admin.request('GET', '/api/products')).body, { products: [] });
    assert.equal((await admin.request('DELETE', '/api/products/abc')).status, 404);
  });

  it('adjusts quantities by a delta and records who did it', async () => {
    const created = await createProduct(admin, { quantity: 2 });
    const removed = await adjust(member, created.id, -1);
    assert.equal(removed.status, 200);
    assert.equal(removed.product.quantity, 1);
    assert.equal(removed.product.updatedByName, 'Léa');
    assert.equal((await adjust(admin, created.id, 1)).product.quantity, 2);
  });

  it('counts adjustments sent at the same time', async () => {
    const created = await createProduct(admin, { quantity: 10 });
    await Promise.all([adjust(admin, created.id, -1), adjust(member, created.id, -1), adjust(member, created.id, -1)]);
    const list = await admin.request('GET', '/api/products');
    assert.equal((list.body as { products: Product[] }).products[0]?.quantity, 7);
  });

  it('keeps the quantity at zero when removing from an empty stock', async () => {
    const created = await createProduct(admin, { quantity: 0 });
    const response = await adjust(member, created.id, -1);
    assert.equal(response.status, 200);
    assert.equal(response.product.quantity, 0);
    // Nothing changed, so the product is not marked as changed by Léa.
    assert.equal(response.product.updatedByName, 'Thibault');
  });

  it('validates adjustments', async () => {
    const created = await createProduct(admin);
    for (const delta of [0, '1', null, 1e9]) {
      assert.equal((await adjust(admin, created.id, delta)).status, 400, String(delta));
    }
    assert.equal((await adjust(admin, 999, 1)).status, 404);
  });

  it('keeps products when the account of their last editor is deleted', async () => {
    const created = await createProduct(member);
    const users = (await admin.request('GET', '/api/users')).body as { users: { id: number; name: string }[] };
    const lea = users.users.find((user) => user.name === 'Léa');
    assert.ok(lea);
    assert.equal((await admin.request('DELETE', `/api/users/${lea.id}`)).status, 204);
    const list = (await admin.request('GET', '/api/products')).body as { products: Product[] };
    assert.equal(list.products[0]?.id, created.id);
    assert.equal(list.products[0]?.updatedByName, null);
  });
});
