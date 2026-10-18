import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyAdjustment,
  groupProducts,
  isBelowMinimum,
  isOutOfStock,
  isValidDelta,
  isValidQuantity,
  isValidTarget,
  matchesCategory,
  matchesSearch,
  matchesStockFilter,
  normalizeText,
  parseQuantity,
  parseShopUrl,
  shopLinkText,
  shopName,
} from '../shared/products.ts';
import type { Category, Product } from '../shared/types.ts';

function product(id: number, name: string, categoryId: number | null, quantity = 1, minQuantity = 0): Product {
  return {
    id,
    name,
    categoryId,
    unit: '',
    quantity,
    minQuantity,
    targetQuantity: null,
    shopLinks: [],
    updatedByName: 'Léa',
    updatedAt: '2026-10-09T20:00:00.000Z',
  };
}

describe('applyAdjustment', () => {
  it('adds and removes', () => {
    assert.equal(applyAdjustment(2, 1), 3);
    assert.equal(applyAdjustment(2, -1), 1);
  });

  it('never goes below zero', () => {
    assert.equal(applyAdjustment(0, -1), 0);
    assert.equal(applyAdjustment(0.5, -1), 0);
  });

  it('removes floating point noise', () => {
    assert.equal(applyAdjustment(0.1, 0.2), 0.3);
    assert.equal(applyAdjustment(1.3, -1), 0.3);
  });
});

describe('quantity validation', () => {
  it('accepts non-negative finite quantities', () => {
    assert.equal(isValidQuantity(0), true);
    assert.equal(isValidQuantity(1.5), true);
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '2', null, 2_000_000]) {
      assert.equal(isValidQuantity(value), false, String(value));
    }
  });

  it('accepts non-zero deltas only', () => {
    assert.equal(isValidDelta(-1), true);
    assert.equal(isValidDelta(0.5), true);
    for (const value of [0, Number.NaN, '1', undefined]) {
      assert.equal(isValidDelta(value), false, String(value));
    }
  });
});

describe('isValidTarget', () => {
  it('refuses a target below the minimum', () => {
    assert.equal(isValidTarget(2, null), true);
    assert.equal(isValidTarget(2, 2), true);
    assert.equal(isValidTarget(2, 4), true);
    assert.equal(isValidTarget(2, 1), false);
  });
});

describe('parseQuantity', () => {
  it('reads numbers typed with a decimal comma or point', () => {
    assert.equal(parseQuantity('2'), 2);
    assert.equal(parseQuantity(' 1,5 '), 1.5);
    assert.equal(parseQuantity('0.25'), 0.25);
    assert.equal(parseQuantity(',5'), 0.5);
  });

  it('refuses anything else', () => {
    for (const text of ['', '-1', 'abc', '1,2,3', '1e3', '2 kg']) {
      assert.equal(parseQuantity(text), null, text);
    }
  });
});

describe('normalizeText', () => {
  it('trims and checks the length', () => {
    assert.equal(normalizeText('  Pâtes ', 10), 'Pâtes');
    assert.equal(normalizeText('   ', 10), null);
    assert.equal(normalizeText('   ', 10, true), '');
    assert.equal(normalizeText('x'.repeat(11), 10), null);
  });
});

describe('matchesSearch', () => {
  it('ignores case and accents', () => {
    const pates = product(1, 'Pâtes complètes', null);
    assert.equal(matchesSearch(pates, 'pates'), true);
    assert.equal(matchesSearch(pates, 'COMPLÈTES'), true);
    assert.equal(matchesSearch(pates, ''), true);
    assert.equal(matchesSearch(pates, 'riz'), false);
  });

  it('finds every word in any order', () => {
    const riz = product(1, 'Riz basmati', null);
    assert.equal(matchesSearch(riz, 'basmati riz'), true);
    assert.equal(matchesSearch(riz, '  riz   bas '), true);
    assert.equal(matchesSearch(riz, 'riz rond'), false);
  });

  it('also looks in the category name', () => {
    const pois = product(1, 'Petits pois', 1);
    assert.equal(matchesSearch(pois, 'surgeles', 'Surgelés'), true);
    assert.equal(matchesSearch(pois, 'pois surgelés', 'Surgelés'), true);
    assert.equal(matchesSearch(pois, 'surgelés'), false);
  });
});

describe('matchesCategory', () => {
  it('keeps every product, one category, or the products without a category', () => {
    const sucre = product(1, 'Sucre', 1);
    const eponges = product(2, 'Éponges', null);
    assert.equal(matchesCategory(sucre, 'all'), true);
    assert.equal(matchesCategory(eponges, 'all'), true);
    assert.equal(matchesCategory(sucre, 1), true);
    assert.equal(matchesCategory(sucre, 2), false);
    assert.equal(matchesCategory(eponges, 1), false);
    assert.equal(matchesCategory(sucre, null), false);
    assert.equal(matchesCategory(eponges, null), true);
  });
});

describe('isBelowMinimum', () => {
  it('is true strictly under the minimum', () => {
    assert.equal(isBelowMinimum(product(1, 'Riz', null, 1, 2)), true);
    assert.equal(isBelowMinimum(product(1, 'Riz', null, 2, 2)), false);
  });
});

describe('isOutOfStock', () => {
  it('is true at zero only', () => {
    assert.equal(isOutOfStock(product(1, 'Riz', null, 0, 0)), true);
    assert.equal(isOutOfStock(product(1, 'Riz', null, 0.5, 2)), false);
  });
});

describe('matchesStockFilter', () => {
  it('keeps the products to buy again, those out of stock, or a category', () => {
    const riz = product(1, 'Riz', 1, 1, 2);
    const sel = product(2, 'Sel', 2, 0, 0);
    const sucre = product(3, 'Sucre', 1, 3, 1);
    assert.equal(matchesStockFilter(riz, 'low'), true);
    assert.equal(matchesStockFilter(sel, 'low'), false);
    assert.equal(matchesStockFilter(sucre, 'low'), false);
    assert.equal(matchesStockFilter(riz, 'out'), false);
    assert.equal(matchesStockFilter(sel, 'out'), true);
    assert.equal(matchesStockFilter(sucre, 1), true);
    assert.equal(matchesStockFilter(sel, 1), false);
    assert.equal(matchesStockFilter(sel, 'all'), true);
  });

  it('keeps the products without an online order link', () => {
    const riz = product(1, 'Riz', 1, 1, 2);
    const sel = { ...product(2, 'Sel', 2, 0, 0), shopLinks: [{ label: '', url: 'https://lafourche.fr/sel' }] };
    assert.equal(matchesStockFilter(riz, 'nolink'), true);
    assert.equal(matchesStockFilter(sel, 'nolink'), false);
  });
});

describe('groupProducts', () => {
  const categories: Category[] = [
    { id: 1, name: 'Épicerie sucrée', position: 1 },
    { id: 2, name: 'Épicerie salée', position: 0 },
    { id: 3, name: 'Hygiène', position: 2 },
  ];

  it('groups by category in category order, products by name, uncategorized last', () => {
    const groups = groupProducts(
      [product(1, 'Sucre', 1), product(2, 'riz', 2), product(3, 'Éponges', null), product(4, 'Pâtes', 2)],
      categories,
    );
    assert.deepEqual(
      groups.map((group) => [group.category?.name ?? null, group.products.map((p) => p.name)]),
      [
        ['Épicerie salée', ['Pâtes', 'riz']],
        ['Épicerie sucrée', ['Sucre']],
        [null, ['Éponges']],
      ],
    );
  });

  it('puts products of an unknown category with the uncategorized ones', () => {
    const groups = groupProducts([product(1, 'Thé', 99)], categories);
    assert.deepEqual(groups.map((group) => group.category), [null]);
  });
});

describe('parseShopUrl', () => {
  it('accepts web links', () => {
    assert.equal(parseShopUrl(' https://www.lafourche.fr/products/pates '), 'https://www.lafourche.fr/products/pates');
    assert.equal(parseShopUrl('http://drive.example/p?id=3'), 'http://drive.example/p?id=3');
    assert.equal(parseShopUrl('lafourche.fr/products/pates'), 'https://lafourche.fr/products/pates');
  });

  it('refuses anything else', () => {
    const invalid = ['', 'pates', 'https://', 'javascript:alert(1)', 'data:text/html,x', `https://a.fr/${'x'.repeat(2000)}`];
    for (const text of invalid) {
      assert.equal(parseShopUrl(text), null, text);
    }
  });
});

describe('shopName', () => {
  it('names the shop by its domain', () => {
    assert.equal(shopName('https://www.lafourche.fr/products/pates'), 'lafourche.fr');
    assert.equal(shopName('https://drive.example/p'), 'drive.example');
  });

  it('names a link by its label and shop', () => {
    assert.equal(shopLinkText({ label: '', url: 'https://www.lafourche.fr/p' }), 'Ouvrir sur lafourche.fr');
    assert.equal(shopLinkText({ label: 'Barilla 500 g', url: 'https://lafourche.fr/p' }), 'Barilla 500 g · lafourche.fr');
  });
});
