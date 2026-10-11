import { compareNames, type CategoryFilter } from '../../shared/products.ts';
import type { Category, Product } from '../../shared/types.ts';
import { h } from '../dom.ts';

const ALL = 'all';
const NONE = 'none';

// A select to narrow a product list to one category. It offers the categories
// that have products in the list, and « Sans catégorie » when some have none.
// It is hidden while there is nothing to choose between.
export function categoryFilter(onChange: () => void): {
  element: HTMLSelectElement;
  value: () => CategoryFilter;
  update: (categories: readonly Category[], products: readonly Product[]) => void;
} {
  const element = h('select', { name: 'category-filter', 'aria-label': 'Filtrer par catégorie' });
  element.addEventListener('change', onChange);

  function value(): CategoryFilter {
    if (element.value === NONE) {
      return null;
    }
    const id = Number(element.value);
    return element.value === ALL || element.value === '' || !Number.isInteger(id) ? 'all' : id;
  }

  // Rebuilds the options from the current list. The choice is kept while it
  // still exists, otherwise the filter goes back to every category.
  function update(categories: readonly Category[], products: readonly Product[]): void {
    const previous = element.value;
    const used = new Set(products.map((product) => product.categoryId));
    const shown = categories
      .filter((category) => used.has(category.id))
      .sort((a, b) => a.position - b.position || compareNames(a.name, b.name));
    const hasUncategorized = used.has(null);
    const options = [
      h('option', { value: ALL }, 'Toutes les catégories'),
      ...shown.map((category) => h('option', { value: String(category.id) }, category.name)),
      hasUncategorized ? h('option', { value: NONE }, 'Sans catégorie') : null,
    ].filter((option) => option !== null);
    element.replaceChildren(...options);
    element.value = options.some((option) => option.value === previous) ? previous : ALL;
    element.hidden = options.length <= 2;
  }

  return { element, value, update };
}
