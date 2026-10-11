import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GROUP_WINDOW_MS, groupEvents, isProductEvent, productEventFields } from '../shared/product-history.ts';
import type { ProductSnapshot } from '../shared/product-history.ts';
import type { ProductEvent } from '../shared/types.ts';

const pasta: ProductSnapshot = {
  name: 'Pâtes',
  categoryName: 'Épicerie',
  unit: 'paquets',
  quantity: 3,
  minQuantity: 2,
  targetQuantity: null,
};

describe('productEventFields', () => {
  it('records nothing when nothing changed', () => {
    assert.equal(productEventFields(pasta, { ...pasta }), null);
  });

  it('records a quantity change without field changes', () => {
    assert.deepEqual(productEventFields(pasta, { ...pasta, quantity: 2 }), {
      quantityBefore: 3,
      quantityAfter: 2,
      changes: [],
    });
  });

  it('records only the changed fields, and no quantity when it did not change', () => {
    assert.deepEqual(productEventFields(pasta, { ...pasta, minQuantity: 3, targetQuantity: 4, categoryName: null }), {
      quantityBefore: null,
      quantityAfter: null,
      changes: [
        { field: 'categoryName', before: 'Épicerie', after: null },
        { field: 'minQuantity', before: 2, after: 3 },
        { field: 'targetQuantity', before: null, after: 4 },
      ],
    });
  });

  it('records an empty unit as no unit', () => {
    assert.deepEqual(productEventFields({ ...pasta, unit: '' }, pasta)?.changes, [
      { field: 'unit', before: null, after: 'paquets' },
    ]);
  });

  it('records the whole product when it is created or deleted', () => {
    const created = productEventFields(null, pasta);
    assert.equal(created?.quantityBefore, null);
    assert.equal(created?.quantityAfter, 3);
    assert.deepEqual(
      created?.changes.map((change) => [change.field, change.after]),
      [
        ['name', 'Pâtes'],
        ['categoryName', 'Épicerie'],
        ['unit', 'paquets'],
        ['minQuantity', 2],
      ],
    );
    const deleted = productEventFields(pasta, null);
    assert.equal(deleted?.quantityBefore, 3);
    assert.equal(deleted?.quantityAfter, null);
  });

  it('records a product created with 0 in stock', () => {
    assert.equal(productEventFields(null, { ...pasta, quantity: 0 })?.quantityAfter, 0);
  });
});

describe('groupEvents', () => {
  const start = Date.parse('2026-10-11T18:00:00.000Z');
  let nextId = 100;

  function event(fields: Partial<ProductEvent> & { minutesAgo: number }): ProductEvent {
    const { minutesAgo, ...rest } = fields;
    return {
      id: nextId--,
      productId: 1,
      productName: 'Pâtes',
      userName: 'Léa',
      kind: 'adjusted',
      quantityBefore: 3,
      quantityAfter: 2,
      changes: [],
      createdAt: new Date(start - minutesAgo * 60_000).toISOString(),
      ...rest,
    };
  }

  it('groups the − of one person in a row', () => {
    const groups = groupEvents([
      event({ minutesAgo: 0, quantityBefore: 2, quantityAfter: 1 }),
      event({ minutesAgo: 1, quantityBefore: 3, quantityAfter: 2 }),
      event({ minutesAgo: 2, quantityBefore: 4, quantityAfter: 3 }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.count, 3);
    assert.equal(groups[0]?.quantityBefore, 4);
    assert.equal(groups[0]?.quantityAfter, 1);
  });

  it('keeps apart different people, directions, kinds and distant events', () => {
    const groups = groupEvents([
      event({ minutesAgo: 0 }),
      event({ minutesAgo: 1, userName: 'Thibault' }),
      event({ minutesAgo: 2, userName: 'Thibault', quantityBefore: 2, quantityAfter: 3 }),
      event({ minutesAgo: 3, userName: 'Thibault', kind: 'purchased', quantityBefore: 0, quantityAfter: 2 }),
      event({ minutesAgo: 4, userName: 'Thibault', kind: 'purchased', quantityBefore: 0, quantityAfter: 2 }),
      event({ minutesAgo: 5 + GROUP_WINDOW_MS / 60_000, userName: 'Thibault' }),
    ]);
    assert.deepEqual(
      groups.map((group) => group.count),
      [1, 1, 1, 1, 1, 1],
    );
  });

  it('measures the window between consecutive events', () => {
    const step = GROUP_WINDOW_MS / 60_000 - 1;
    const groups = groupEvents([event({ minutesAgo: 0 }), event({ minutesAgo: step }), event({ minutesAgo: 2 * step })]);
    assert.equal(groups.length, 1);
  });
});

describe('isProductEvent', () => {
  it('validates an event and its changes', () => {
    const valid: ProductEvent = {
      id: 1,
      productId: 1,
      productName: 'Pâtes',
      userName: 'Léa',
      kind: 'edited',
      quantityBefore: null,
      quantityAfter: null,
      changes: [{ field: 'minQuantity', before: 2, after: 3 }],
      createdAt: '2026-10-11T18:00:00.000Z',
    };
    assert.ok(isProductEvent(valid));
    assert.ok(!isProductEvent({ ...valid, kind: 'renamed' }));
    assert.ok(!isProductEvent({ ...valid, changes: [{ field: 'quantity', before: 1, after: 2 }] }));
  });
});
