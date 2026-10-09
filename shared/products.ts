// Product and stock rules shared by the server (validation) and the client
// (forms, list). They depend on neither HTTP nor SQLite.

import type { Category, Product } from './types.ts';

export const PRODUCT_NAME_MAX_LENGTH = 100;
export const CATEGORY_NAME_MAX_LENGTH = 50;
export const UNIT_MAX_LENGTH = 30;
export const QUANTITY_MAX = 1_000_000;

// Quantities keep three decimals (grams for a kilo), which also removes
// floating point noise such as 0.1 + 0.2 = 0.30000000000000004.
export function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function isValidQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= QUANTITY_MAX;
}

export function isValidDelta(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0 && Math.abs(value) <= QUANTITY_MAX;
}

// The quantity after an adjustment. Stock never goes below zero: removing a
// packet that was not counted leaves the product at 0.
export function applyAdjustment(quantity: number, delta: number): number {
  return Math.min(QUANTITY_MAX, Math.max(0, roundQuantity(quantity + delta)));
}

// Returns the trimmed text, or null when it is empty (unless allowed) or too long.
export function normalizeText(value: string, maxLength: number, allowEmpty = false): string | null {
  const text = value.normalize('NFC').trim();
  if (text.length > maxLength || (text.length === 0 && !allowEmpty)) {
    return null;
  }
  return text;
}

// Reads a quantity typed in a form, where French users write a decimal comma
// ('1,5'). Returns null when it is not a valid quantity.
export function parseQuantity(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(normalized)) {
    return null;
  }
  const value = roundQuantity(Number(normalized));
  return isValidQuantity(value) ? value : null;
}

// The key a search compares names by: 'Pâtes' matches 'pates'.
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr')
    .trim();
}

export function matchesSearch(product: Product, search: string): boolean {
  return searchKey(product.name).includes(searchKey(search));
}

export function isBelowMinimum(product: Product): boolean {
  return product.quantity < product.minQuantity;
}

export type ProductGroup = {
  // Null for the products without a category, listed last.
  category: Category | null;
  products: Product[];
};

// Groups products by category, in category order, with products sorted by
// name. Categories without products are left out.
export function groupProducts(products: readonly Product[], categories: readonly Category[]): ProductGroup[] {
  const sortedCategories = [...categories].sort((a, b) => a.position - b.position || compareNames(a.name, b.name));
  const groups: ProductGroup[] = [...sortedCategories, null].map((category) => ({ category, products: [] }));
  const byCategoryId = new Map(groups.map((group) => [group.category?.id ?? null, group]));
  const uncategorized = groups[groups.length - 1];

  for (const product of products) {
    const group = byCategoryId.get(product.categoryId) ?? uncategorized;
    group?.products.push(product);
  }
  for (const group of groups) {
    group.products.sort((a, b) => compareNames(a.name, b.name));
  }
  return groups.filter((group) => group.products.length > 0);
}

export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { sensitivity: 'base' });
}
