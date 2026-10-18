import { compareNames, hasShopLink, isBelowMinimum, isOutOfStock, type StockFilter } from '../../shared/products.ts';
import type { Category, Product } from '../../shared/types.ts';
import { h } from '../dom.ts';

const ALL = 'all';
const LOW = 'low';
const OUT = 'out';
const FREQUENT = 'frequent';
const NO_LINK = 'nolink';
const NONE = 'none';

type Chip = { key: string; label: string; count?: number };

// A row of chips to narrow a product list: every product, the categories that
// have products in the list, and « Sans catégorie » when some have none. With
// statuses, it also offers the products the family uses most, those to buy
// again, those out of stock and those without an online order link, with
// their count. One tap picks a chip; the row is hidden while there is nothing
// to choose between.
export function categoryFilter(
  onChange: () => void,
  options: { statuses?: boolean } = {},
): {
  element: HTMLDivElement;
  value: () => StockFilter;
  state: () => string;
  restore: (state: string) => void;
  update: (categories: readonly Category[], products: readonly Product[], frequentIds?: ReadonlySet<number>) => void;
} {
  const element = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrer les produits' });
  element.hidden = true;
  let selected = ALL;

  function value(): StockFilter {
    if (selected === LOW || selected === OUT || selected === FREQUENT || selected === NO_LINK) {
      return selected;
    }
    if (selected === NONE) {
      return null;
    }
    const id = Number(selected);
    return selected === ALL || !Number.isInteger(id) ? 'all' : id;
  }

  function chipButton(chip: Chip): HTMLButtonElement {
    const button = h(
      'button',
      { type: 'button', class: 'chip', 'aria-pressed': chip.key === selected ? 'true' : 'false' },
      chip.label,
      chip.count === undefined ? null : h('span', { class: 'chip-count' }, String(chip.count)),
    );
    button.dataset['key'] = chip.key;
    button.addEventListener('click', () => {
      selected = chip.key;
      for (const other of element.querySelectorAll<HTMLButtonElement>('.chip')) {
        other.setAttribute('aria-pressed', other.dataset['key'] === selected ? 'true' : 'false');
      }
      onChange();
    });
    return button;
  }

  // Rebuilds the chips from the current list. The choice is kept while it
  // still exists, otherwise the filter goes back to every product. A status
  // chip stays while it is picked, even when its count drops to 0.
  function update(
    categories: readonly Category[],
    products: readonly Product[],
    frequentIds: ReadonlySet<number> = new Set(),
  ): void {
    const used = new Set(products.map((product) => product.categoryId));
    const chips: Chip[] = [{ key: ALL, label: 'Tous' }];
    if (options.statuses === true) {
      const frequent = products.filter((product) => frequentIds.has(product.id)).length;
      if (frequent > 0 || selected === FREQUENT) {
        chips.push({ key: FREQUENT, label: 'Fréquents', count: frequent });
      }
      const low = products.filter(isBelowMinimum).length;
      const out = products.filter(isOutOfStock).length;
      if (low > 0 || selected === LOW) {
        chips.push({ key: LOW, label: 'À racheter', count: low });
      }
      if (out > 0 || selected === OUT) {
        chips.push({ key: OUT, label: 'En rupture', count: out });
      }
      // Only offered once some product has a link: a family that does not
      // order online never sees it.
      const withLink = products.filter(hasShopLink).length;
      const noLink = products.length - withLink;
      if ((withLink > 0 && noLink > 0) || selected === NO_LINK) {
        chips.push({ key: NO_LINK, label: 'Sans lien', count: noLink });
      }
    }
    chips.push(
      ...categories
        .filter((category) => used.has(category.id))
        .sort((a, b) => a.position - b.position || compareNames(a.name, b.name))
        .map((category) => ({ key: String(category.id), label: category.name })),
    );
    if (used.has(null)) {
      chips.push({ key: NONE, label: 'Sans catégorie' });
    }
    if (!chips.some((chip) => chip.key === selected)) {
      selected = ALL;
    }
    // Keeps the keyboard focus on the picked chip across the rebuild.
    const hadFocus = element.contains(document.activeElement);
    element.replaceChildren(...chips.map(chipButton));
    if (hadFocus) {
      element.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    }
    element.hidden = chips.length <= 2 && selected === ALL;
  }

  return {
    element,
    value,
    state: () => selected,
    restore(state) {
      selected = state;
    },
    update,
  };
}
