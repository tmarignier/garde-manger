// Shopping list rules. They depend on neither HTTP nor SQLite.

import { compareNames, isBelowMinimum, roundQuantity } from '../shared/products.ts';
import type { Product, ShoppingListItem } from '../shared/types.ts';

// What to buy to get back to the target quantity, or to the minimum when the
// product has no target.
export function quantityToBuy(product: Product): number {
  const goal = product.targetQuantity ?? product.minQuantity;
  return Math.max(0, roundQuantity(goal - product.quantity));
}

// The products below their minimum, sorted by name, with the quantity to buy.
export function computeShoppingList(products: readonly Product[]): ShoppingListItem[] {
  return products
    .filter(isBelowMinimum)
    .map((product) => ({ product, quantityToBuy: quantityToBuy(product) }))
    .sort((a, b) => compareNames(a.product.name, b.product.name));
}
