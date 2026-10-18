import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeShoppingList, quantityToBuy } from '../server/shopping-list.ts';
import type { Product } from '../shared/types.ts';

function product(name: string, quantity: number, minQuantity: number, targetQuantity: number | null = null): Product {
  return {
    id: name.length,
    name,
    categoryId: null,
    unit: '',
    quantity,
    minQuantity,
    targetQuantity,
    shopUrl: null,
    updatedByName: 'Léa',
    updatedAt: '2026-10-09T20:00:00.000Z',
  };
}

describe('quantityToBuy', () => {
  it('fills up to the target quantity', () => {
    assert.equal(quantityToBuy(product('Pâtes', 1, 2, 4)), 3);
  });

  it('fills up to the minimum without a target', () => {
    assert.equal(quantityToBuy(product('Pâtes', 0, 2)), 2);
  });

  it('keeps decimals without floating point noise', () => {
    assert.equal(quantityToBuy(product('Farine', 0.1, 0.3)), 0.2);
  });

  it('never proposes a negative quantity', () => {
    assert.equal(quantityToBuy(product('Riz', 5, 2)), 0);
  });
});

describe('computeShoppingList', () => {
  it('lists the products below their minimum, sorted by name', () => {
    const list = computeShoppingList([
      product('riz', 0, 1),
      product('Pâtes', 1, 2, 4),
      product('Café', 2, 2),
      product('Éponges', 0, 1, 3),
      product('Sel', 3, 0),
    ]);
    assert.deepEqual(
      list.map((item) => [item.product.name, item.quantityToBuy]),
      [
        ['Éponges', 3],
        ['Pâtes', 3],
        ['riz', 1],
      ],
    );
  });

  it('leaves out products without a minimum', () => {
    assert.deepEqual(computeShoppingList([product('Sel', 0, 0)]), []);
  });

  it('gives the bought quantity of checked products and keeps them on the list', () => {
    const pasta = product('Pâtes', 1, 2, 4);
    const rice = product('Riz', 0, 1);
    // Bought at the shop, then someone at home found a box.
    const coffee = product('Café', 3, 1);
    const list = computeShoppingList(
      [coffee, pasta, rice],
      new Map([
        [pasta.id, 6],
        [coffee.id, 1],
      ]),
    );
    assert.deepEqual(
      list.map((item) => [item.product.name, item.quantityToBuy, item.boughtQuantity]),
      [
        ['Café', 0, 1],
        ['Pâtes', 3, 6],
        ['Riz', 1, null],
      ],
    );
  });
});
