import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { openDatabase } from '../server/database.ts';
import { createApp } from '../server/server.ts';
import type { ExtraItem, Product, ProductRequest, ShoppingListResponse } from '../shared/types.ts';
import { Device } from './helpers.ts';

describe('shopping list API', () => {
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

  async function createProduct(fields: Partial<ProductRequest>): Promise<Product> {
    const body: ProductRequest = {
      name: 'Pâtes',
      categoryId: null,
      unit: 'paquets',
      quantity: 0,
      minQuantity: 2,
      targetQuantity: null,
      ...fields,
    };
    const response = await admin.request('POST', '/api/products', body);
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return (response.body as { product: Product }).product;
  }

  async function addExtraItem(device: Device, name: string): Promise<ExtraItem> {
    const response = await device.request('POST', '/api/extra-items', { name });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return (response.body as { extraItem: ExtraItem }).extraItem;
  }

  async function getList(device: Device): Promise<ShoppingListResponse> {
    const response = await device.request('GET', '/api/shopping-list');
    assert.equal(response.status, 200);
    return response.body as ShoppingListResponse;
  }

  async function purchase(device: Device, body: unknown): Promise<{ status: number; body: unknown }> {
    return device.request('POST', '/api/shopping-list/purchases', body);
  }

  async function quantityOf(id: number): Promise<number | undefined> {
    const response = await admin.request('GET', '/api/products');
    return (response.body as { products: Product[] }).products.find((product) => product.id === id)?.quantity;
  }

  it('requires a session', async () => {
    const anonymous = new Device(admin.baseUrl);
    assert.equal((await anonymous.request('GET', '/api/shopping-list')).status, 401);
    assert.equal((await anonymous.request('POST', '/api/extra-items', { name: 'Bougies' })).status, 401);
    assert.equal((await purchase(anonymous, { purchases: [] })).status, 401);
    assert.equal((await anonymous.request('PUT', '/api/shopping-list/checks/1', { quantity: 1 })).status, 401);
    assert.equal((await anonymous.request('PUT', '/api/extra-items/1/check')).status, 401);
  });

  it('lists the products below their minimum with the quantity to buy', async () => {
    const pasta = await createProduct({ name: 'Pâtes', quantity: 1, minQuantity: 2, targetQuantity: 5 });
    const rice = await createProduct({ name: 'Riz', quantity: 0, minQuantity: 1 });
    await createProduct({ name: 'Sel', quantity: 3, minQuantity: 1 });
    const list = await getList(member);
    assert.deepEqual(
      list.items.map((item) => [item.product.id, item.quantityToBuy, item.boughtQuantity]),
      [
        [pasta.id, 4, null],
        [rice.id, 1, null],
      ],
    );
    assert.deepEqual(list.extraItems, []);
  });

  it('adds and removes extra items', async () => {
    const candles = await addExtraItem(member, ' Bougies ');
    const cake = await addExtraItem(admin, 'Gâteau d’anniversaire');
    assert.equal(candles.name, 'Bougies');
    assert.deepEqual((await getList(admin)).extraItems, [candles, cake]);

    assert.equal((await member.request('DELETE', `/api/extra-items/${candles.id}`)).status, 204);
    assert.equal((await member.request('DELETE', `/api/extra-items/${candles.id}`)).status, 404);
    assert.equal((await member.request('DELETE', '/api/extra-items/abc')).status, 404);
    assert.deepEqual((await getList(admin)).extraItems, [cake]);
  });

  it('validates extra items', async () => {
    for (const body of [undefined, {}, { name: '' }, { name: '   ' }, { name: 3 }, { name: 'x'.repeat(101) }]) {
      assert.equal((await admin.request('POST', '/api/extra-items', body)).status, 400, JSON.stringify(body));
    }
  });

  it('adds purchases to the stock and removes bought extra items', async () => {
    const pasta = await createProduct({ name: 'Pâtes', quantity: 1, minQuantity: 2, targetQuantity: 4 });
    const flour = await createProduct({ name: 'Farine', unit: 'kg', quantity: 0.2, minQuantity: 1 });
    const candles = await addExtraItem(admin, 'Bougies');
    const cake = await addExtraItem(admin, 'Gâteau');

    const response = await purchase(member, {
      purchases: [
        { productId: pasta.id, quantity: 3 },
        { productId: flour.id, quantity: 0.5 },
      ],
      extraItemIds: [candles.id],
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const list = response.body as ShoppingListResponse;
    // Pasta is back to its target; flour is still below its minimum.
    assert.deepEqual(
      list.items.map((item) => [item.product.name, item.product.quantity, item.quantityToBuy]),
      [['Farine', 0.7, 0.3]],
    );
    assert.deepEqual(list.extraItems, [cake]);
    const products = (await admin.request('GET', '/api/products')).body as { products: Product[] };
    const boughtPasta = products.products.find((product) => product.id === pasta.id);
    assert.equal(boughtPasta?.quantity, 4);
    assert.equal(boughtPasta?.updatedByName, 'Léa');
  });

  it('adds purchases to changes made meanwhile', async () => {
    const pasta = await createProduct({ name: 'Pâtes', quantity: 1, minQuantity: 2 });
    // Someone at home finds a packet while the list is being shopped.
    await admin.request('POST', `/api/products/${pasta.id}/adjust`, { delta: 1 });
    assert.equal((await purchase(member, { purchases: [{ productId: pasta.id, quantity: 1 }] })).status, 200);
    assert.equal(await quantityOf(pasta.id), 3);
  });

  it('skips products and extra items deleted meanwhile', async () => {
    const pasta = await createProduct({ name: 'Pâtes' });
    const rice = await createProduct({ name: 'Riz' });
    const candles = await addExtraItem(admin, 'Bougies');
    assert.equal((await admin.request('DELETE', `/api/products/${rice.id}`)).status, 204);
    assert.equal((await admin.request('DELETE', `/api/extra-items/${candles.id}`)).status, 204);
    const response = await purchase(member, {
      purchases: [
        { productId: rice.id, quantity: 2 },
        { productId: pasta.id, quantity: 2 },
      ],
      extraItemIds: [candles.id],
    });
    assert.equal(response.status, 200);
    assert.equal(await quantityOf(pasta.id), 2);
  });

  it('validates purchases and changes nothing when one is invalid', async () => {
    const pasta = await createProduct({ name: 'Pâtes' });
    const invalid = [
      undefined,
      [],
      { purchases: 'all' },
      { purchases: [null] },
      { purchases: [[pasta.id, 1]] },
      { purchases: [{ productId: pasta.id }] },
      { purchases: [{ productId: pasta.id, quantity: 0 }] },
      { purchases: [{ productId: pasta.id, quantity: -1 }] },
      { purchases: [{ productId: pasta.id, quantity: '2' }] },
      { purchases: [{ productId: pasta.id, quantity: 1e9 }] },
      { purchases: [{ productId: '1', quantity: 1 }] },
      { purchases: [{ productId: 1.5, quantity: 1 }] },
      { purchases: [{ productId: pasta.id, quantity: 1 }, { productId: pasta.id, quantity: 1 }] },
      { purchases: [{ productId: pasta.id, quantity: 1 }], extraItemIds: ['1'] },
      { purchases: [{ productId: pasta.id, quantity: 1 }], extraItemIds: 1 },
    ];
    for (const body of invalid) {
      assert.equal((await purchase(member, body)).status, 400, JSON.stringify(body));
    }
    assert.equal(await quantityOf(pasta.id), 0);
  });

  it('shares checks between devices until the purchases are validated', async () => {
    const pasta = await createProduct({ name: 'Pâtes', quantity: 0, minQuantity: 2 });
    const rice = await createProduct({ name: 'Riz', quantity: 0, minQuantity: 1 });
    const candles = await addExtraItem(admin, 'Bougies');
    const cake = await addExtraItem(admin, 'Gâteau');
    assert.equal(candles.checked, false);

    // Checked while ordering on the drive website…
    assert.equal((await admin.request('PUT', `/api/shopping-list/checks/${pasta.id}`, { quantity: 2 })).status, 204);
    assert.equal((await admin.request('PUT', `/api/shopping-list/checks/${pasta.id}`, { quantity: 6 })).status, 204);
    assert.equal((await admin.request('PUT', `/api/shopping-list/checks/${rice.id}`, { quantity: 1 })).status, 204);
    assert.equal((await admin.request('DELETE', `/api/shopping-list/checks/${rice.id}`)).status, 204);
    assert.equal((await admin.request('DELETE', `/api/shopping-list/checks/${rice.id}`)).status, 204);
    assert.equal((await admin.request('PUT', `/api/extra-items/${candles.id}/check`)).status, 204);

    // …and seen on another phone at delivery.
    const list = await getList(member);
    assert.deepEqual(
      list.items.map((item) => [item.product.name, item.boughtQuantity]),
      [
        ['Pâtes', 6],
        ['Riz', null],
      ],
    );
    assert.deepEqual(list.extraItems, [{ ...candles, checked: true }, cake]);

    const response = await purchase(member, {
      purchases: [{ productId: pasta.id, quantity: 6 }],
      extraItemIds: [candles.id],
    });
    assert.equal(response.status, 200);
    const after = await getList(admin);
    assert.deepEqual(
      after.items.map((item) => [item.product.name, item.boughtQuantity]),
      [['Riz', null]],
    );
    assert.deepEqual(after.extraItems, [cake]);
    assert.equal(await quantityOf(pasta.id), 6);
  });

  it('keeps a checked product on the list when it is no longer below its minimum', async () => {
    const pasta = await createProduct({ name: 'Pâtes', quantity: 0, minQuantity: 2 });
    assert.equal((await member.request('PUT', `/api/shopping-list/checks/${pasta.id}`, { quantity: 2 })).status, 204);
    // Someone at home found packets before the order was delivered.
    await admin.request('POST', `/api/products/${pasta.id}/adjust`, { delta: 3 });
    assert.deepEqual(
      (await getList(member)).items.map((item) => [item.product.name, item.quantityToBuy, item.boughtQuantity]),
      [['Pâtes', 0, 2]],
    );
    // Unchecked, it leaves the list.
    assert.equal((await member.request('DELETE', `/api/shopping-list/checks/${pasta.id}`)).status, 204);
    assert.deepEqual((await getList(member)).items, []);
  });

  it('forgets the check of a deleted product', async () => {
    const pasta = await createProduct({ name: 'Pâtes' });
    assert.equal((await member.request('PUT', `/api/shopping-list/checks/${pasta.id}`, { quantity: 2 })).status, 204);
    assert.equal((await admin.request('DELETE', `/api/products/${pasta.id}`)).status, 204);
    assert.deepEqual((await getList(member)).items, []);
  });

  it('validates checks', async () => {
    const pasta = await createProduct({ name: 'Pâtes' });
    const invalid = [undefined, {}, { quantity: 0 }, { quantity: -1 }, { quantity: 0.0001 }, { quantity: '2' }, { quantity: 1e9 }];
    for (const body of invalid) {
      const response = await member.request('PUT', `/api/shopping-list/checks/${pasta.id}`, body);
      assert.equal(response.status, 400, JSON.stringify(body));
    }
    assert.equal((await member.request('PUT', '/api/shopping-list/checks/999', { quantity: 1 })).status, 404);
    assert.equal((await member.request('PUT', '/api/shopping-list/checks/abc', { quantity: 1 })).status, 404);
    assert.equal((await member.request('PUT', '/api/extra-items/999/check')).status, 404);
    assert.equal((await member.request('DELETE', '/api/extra-items/999/check')).status, 404);
    assert.equal((await getList(member)).items[0]?.boughtQuantity, null);
  });
});
