// Rules of a product's history, shared by the server (what to record) and the
// client (validating and grouping what it shows).
import type { ProductChange, ProductEvent, ProductEventKind, ProductField } from './types.ts';

// A product as recorded in its history, with its category by name.
export type ProductSnapshot = {
  name: string;
  categoryName: string | null;
  unit: string;
  quantity: number;
  minQuantity: number;
  targetQuantity: number | null;
};

export type ProductEventFields = Pick<ProductEvent, 'quantityBefore' | 'quantityAfter' | 'changes'>;

export const PRODUCT_EVENT_KINDS: readonly ProductEventKind[] = ['created', 'adjusted', 'purchased', 'edited', 'deleted'];

export const PRODUCT_FIELDS: readonly ProductField[] = ['name', 'categoryName', 'unit', 'minQuantity', 'targetQuantity'];

// Consecutive + or − closer than this become one line of the history.
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

// An empty unit is shown and recorded as no unit.
function fieldValue(snapshot: ProductSnapshot | null, field: ProductField): string | number | null {
  const value = snapshot === null ? null : snapshot[field];
  return value === '' ? null : value;
}

// What to record for a change from `before` to `after`: before is null for a
// created product, after is null for a deleted one. Returns null when nothing
// changed, so that saving an untouched form or a − at 0 records nothing.
export function productEventFields(
  before: ProductSnapshot | null,
  after: ProductSnapshot | null,
): ProductEventFields | null {
  const changes = PRODUCT_FIELDS.map((field) => ({
    field,
    before: fieldValue(before, field),
    after: fieldValue(after, field),
  })).filter((change) => change.before !== change.after);
  const quantityBefore = before?.quantity ?? null;
  const quantityAfter = after?.quantity ?? null;
  if (quantityBefore === quantityAfter) {
    return changes.length === 0 ? null : { quantityBefore: null, quantityAfter: null, changes };
  }
  return { quantityBefore, quantityAfter, changes };
}

// One line of the history: `count` events grouped together, with the
// quantity before the oldest and after the newest.
export type ProductEventGroup = ProductEvent & { count: number };

function direction(event: ProductEvent): number {
  return Math.sign((event.quantityAfter ?? 0) - (event.quantityBefore ?? 0));
}

// Groups the + or − made in a row by the same person in the same direction,
// each within GROUP_WINDOW_MS of the previous one: three taps on − read as
// "−3 (3 fois)". Events come newest first, and so do the groups.
export function groupEvents(events: readonly ProductEvent[]): ProductEventGroup[] {
  const groups: ProductEventGroup[] = [];
  let oldestAt = 0;
  for (const event of events) {
    const at = Date.parse(event.createdAt);
    const last = groups.at(-1);
    if (
      last !== undefined &&
      last.kind === 'adjusted' &&
      event.kind === 'adjusted' &&
      last.productId === event.productId &&
      last.userName === event.userName &&
      direction(last) === direction(event) &&
      oldestAt - at <= GROUP_WINDOW_MS
    ) {
      groups[groups.length - 1] = { ...last, quantityBefore: event.quantityBefore, count: last.count + 1 };
    } else {
      groups.push({ ...event, count: 1 });
    }
    oldestAt = at;
  }
  return groups;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFieldValue(value: unknown): value is string | number | null {
  return value === null || typeof value === 'string' || typeof value === 'number';
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || typeof value === 'number';
}

export function isProductEventKind(value: unknown): value is ProductEventKind {
  return PRODUCT_EVENT_KINDS.some((kind) => kind === value);
}

export function isProductChange(value: unknown): value is ProductChange {
  return (
    isRecord(value) &&
    PRODUCT_FIELDS.some((field) => field === value['field']) &&
    isFieldValue(value['before']) &&
    isFieldValue(value['after'])
  );
}

export function isProductEvent(value: unknown): value is ProductEvent {
  return (
    isRecord(value) &&
    typeof value['id'] === 'number' &&
    typeof value['productId'] === 'number' &&
    typeof value['productName'] === 'string' &&
    typeof value['userName'] === 'string' &&
    isProductEventKind(value['kind']) &&
    isNumberOrNull(value['quantityBefore']) &&
    isNumberOrNull(value['quantityAfter']) &&
    Array.isArray(value['changes']) &&
    value['changes'].every(isProductChange) &&
    typeof value['createdAt'] === 'string'
  );
}
