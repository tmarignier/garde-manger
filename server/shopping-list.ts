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
// `checks` gives the bought quantity of each checked product: a checked product
// stays on the list until the purchases are validated, even when it is no
// longer below its minimum, because it was ordered or is already in the cart.
export function computeShoppingList(
  products: readonly Product[],
  checks: ReadonlyMap<number, number> = new Map(),
): ShoppingListItem[] {
  return products
    .filter((product) => isBelowMinimum(product) || checks.has(product.id))
    .map((product) => ({
      product,
      quantityToBuy: quantityToBuy(product),
      boughtQuantity: checks.get(product.id) ?? null,
    }))
    .sort((a, b) => compareNames(a.product.name, b.product.name));
}
