import {
  ApiError,
  createExtraItem,
  deleteExtraItem,
  errorMessage,
  getShoppingList,
  listCategories,
  validatePurchases,
} from '../api.ts';
import { PRODUCT_NAME_MAX_LENGTH, groupProducts, matchesCategory, parseQuantity } from '../../shared/products.ts';
import type { Category, ExtraItem, Purchase, ShoppingListItem, ShoppingListResponse } from '../../shared/types.ts';
import { h, messageLine, whileSubmitting } from '../dom.ts';
import { formatQuantity } from '../format.ts';
import { categoryFilter } from './category-filter.ts';

// What is checked during the shopping trip, kept on the device until the
// purchases are validated: the bought quantity of each checked product, and
// the checked extra items.
type Checks = {
  products: Map<number, number>;
  extraItemIds: Set<number>;
};

const CHECKS_KEY = 'garde-manger.shopping-checks';

// Saved so that checks survive Safari reloading the page in the background.
// Storage can be unavailable (private browsing): checks then only last while
// the page is open.
function loadChecks(): Checks {
  const checks: Checks = { products: new Map(), extraItemIds: new Set() };
  try {
    const data: unknown = JSON.parse(localStorage.getItem(CHECKS_KEY) ?? 'null');
    if (typeof data === 'object' && data !== null && 'products' in data && 'extraItemIds' in data) {
      if (Array.isArray(data.products)) {
        for (const entry of data.products as unknown[]) {
          if (Array.isArray(entry) && typeof entry[0] === 'number' && typeof entry[1] === 'number' && entry[1] > 0) {
            checks.products.set(entry[0], entry[1]);
          }
        }
      }
      if (Array.isArray(data.extraItemIds)) {
        for (const id of data.extraItemIds as unknown[]) {
          if (typeof id === 'number') {
            checks.extraItemIds.add(id);
          }
        }
      }
    }
  } catch {
    // Unreadable or unavailable storage: start with nothing checked.
  }
  return checks;
}

function saveChecks(checks: Checks): void {
  try {
    localStorage.setItem(
      CHECKS_KEY,
      JSON.stringify({ products: [...checks.products], extraItemIds: [...checks.extraItemIds] }),
    );
  } catch {
    // See loadChecks.
  }
}

function withUnit(quantity: number, unit: string): string {
  return unit === '' ? formatQuantity(quantity) : `${formatQuantity(quantity)} ${unit}`;
}

// The shopping screen, made to be used with one hand in the shop: tap a row to
// check it, adjust the bought quantity if needed, then validate to add
// everything checked to the stock.
export function shoppingView(): HTMLElement {
  let list: ShoppingListResponse | null = null;
  let categories: Category[] = [];
  const checks = loadChecks();

  const filter = categoryFilter(render);
  const summary = h('p', { class: 'message' }, 'Chargement…');
  const message = messageLine();
  const products = h('div', { class: 'shopping' });
  const extraList = h('ul', { class: 'shopping-items' });
  const validateButton = h('button', { type: 'button', class: 'validate' }, 'Valider les achats');

  async function refresh(): Promise<void> {
    try {
      const [loadedList, loadedCategories] = await Promise.all([getShoppingList(), listCategories()]);
      categories = loadedCategories;
      setList(loadedList);
    } catch (error) {
      message.show(errorMessage(error));
    }
  }

  // Forgets the checks of what left the list meanwhile, for example a product
  // someone at home added to the stock.
  function setList(loaded: ShoppingListResponse): void {
    list = loaded;
    const productIds = new Set(loaded.items.map((item) => item.product.id));
    const extraItemIds = new Set(loaded.extraItems.map((item) => item.id));
    for (const id of checks.products.keys()) {
      if (!productIds.has(id)) {
        checks.products.delete(id);
      }
    }
    for (const id of checks.extraItemIds) {
      if (!extraItemIds.has(id)) {
        checks.extraItemIds.delete(id);
      }
    }
    saveChecks(checks);
    render();
  }

  function render(): void {
    if (list === null) {
      return;
    }
    const count = list.items.length + list.extraItems.length;
    summary.textContent =
      count === 0
        ? 'Rien à acheter : tout est au-dessus de son seuil minimum.'
        : count === 1
          ? '1 article à acheter.'
          : `${count} articles à acheter.`;

    const byProductId = new Map(list.items.map((item) => [item.product.id, item]));
    const listed = list.items.map((item) => item.product);
    filter.update(categories, listed);
    const category = filter.value();
    const groups = groupProducts(
      listed.filter((product) => matchesCategory(product, category)),
      categories,
    );
    products.replaceChildren(
      ...groups.map((group) =>
        h(
          'section',
          { class: 'category' },
          h('h3', {}, group.category?.name ?? 'Sans catégorie'),
          h(
            'ul',
            { class: 'shopping-items' },
            ...group.products.flatMap((product) => {
              const item = byProductId.get(product.id);
              return item === undefined ? [] : [productItem(item)];
            }),
          ),
        ),
      ),
    );
    extraList.replaceChildren(...list.extraItems.map(extraItem));
    updateValidateButton();
  }

  function updateValidateButton(): void {
    const checked = checks.products.size + checks.extraItemIds.size;
    validateButton.disabled = checked === 0;
    validateButton.textContent = checked === 0 ? 'Valider les achats' : `Valider les achats (${checked})`;
  }

  function productItem(item: ShoppingListItem): HTMLLIElement {
    const { product, quantityToBuy } = item;
    const checkbox = h('input', { type: 'checkbox', checked: checks.products.has(product.id) });
    const li = h(
      'li',
      { 'data-checked': checks.products.has(product.id) ? 'true' : undefined },
      h(
        'label',
        { class: 'check-row' },
        checkbox,
        h('span', { class: 'item-name' }, product.name),
        h('span', { class: 'item-quantity' }, withUnit(quantityToBuy, product.unit)),
      ),
      checks.products.has(product.id) ? boughtQuantity(product.id, product.name, product.unit) : null,
    );
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        checks.products.set(product.id, quantityToBuy);
      } else {
        checks.products.delete(product.id);
      }
      saveChecks(checks);
      li.replaceWith(productItem(item));
      updateValidateButton();
    });
    return li;
  }

  // The quantity actually bought, the proposed one by default: the shop may
  // only sell packs of six.
  function boughtQuantity(productId: number, name: string, unit: string): HTMLElement {
    const current = (): number => checks.products.get(productId) ?? 0;
    const input = h('input', {
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      'aria-label': `Quantité achetée : ${name}`,
      value: formatQuantity(current()),
    });
    const minus = h('button', { type: 'button', class: 'step', 'aria-label': `1 de moins : ${name}` }, '−');
    const plus = h('button', { type: 'button', class: 'step', 'aria-label': `1 de plus : ${name}` }, '+');

    function set(quantity: number): void {
      checks.products.set(productId, quantity);
      saveChecks(checks);
      input.value = formatQuantity(quantity);
      minus.disabled = quantity <= 1;
    }

    minus.disabled = current() <= 1;
    minus.addEventListener('click', () => set(current() - 1));
    plus.addEventListener('click', () => set(current() + 1));
    input.addEventListener('change', () => {
      const value = parseQuantity(input.value);
      set(value !== null && value > 0 ? value : current());
    });
    return h(
      'div',
      { class: 'bought' },
      h('span', {}, unit === '' ? 'Acheté' : `Acheté (${unit})`),
      h('div', { class: 'stepper' }, minus, input, plus),
    );
  }

  function extraItem(extra: ExtraItem): HTMLLIElement {
    const checked = checks.extraItemIds.has(extra.id);
    const checkbox = h('input', { type: 'checkbox', checked });
    const remove = h(
      'button',
      { type: 'button', class: 'link remove', 'aria-label': `Retirer de la liste : ${extra.name}` },
      'Retirer',
    );
    const li = h(
      'li',
      { 'data-checked': checked ? 'true' : undefined },
      h(
        'div',
        { class: 'extra-row' },
        h('label', { class: 'check-row' }, checkbox, h('span', { class: 'item-name' }, extra.name)),
        remove,
      ),
    );
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        checks.extraItemIds.add(extra.id);
      } else {
        checks.extraItemIds.delete(extra.id);
      }
      saveChecks(checks);
      li.replaceWith(extraItem(extra));
      updateValidateButton();
    });
    remove.addEventListener('click', () => {
      remove.disabled = true;
      void (async () => {
        try {
          await deleteExtraItem(extra.id);
        } catch (error) {
          // Already removed on another device: the refresh below shows it.
          if (!(error instanceof ApiError && error.status === 404)) {
            message.show(errorMessage(error));
          }
        }
        await refresh();
      })();
    });
    return li;
  }

  const extraName = h('input', {
    type: 'text',
    name: 'extra-item',
    required: true,
    maxlength: String(PRODUCT_NAME_MAX_LENGTH),
    autocomplete: 'off',
    autocapitalize: 'sentences',
    placeholder: 'Par exemple : bougies',
    'aria-label': 'Article à ajouter',
  });
  const extraMessage = messageLine();
  const extraForm = h(
    'form',
    { class: 'extra-form' },
    h('div', { class: 'toolbar' }, extraName, h('button', { type: 'submit' }, 'Ajouter')),
    extraMessage.element,
  );
  extraForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void whileSubmitting(extraForm, async () => {
      try {
        await createExtraItem(extraName.value);
        extraForm.reset();
        extraMessage.show('');
        await refresh();
      } catch (error) {
        extraMessage.show(errorMessage(error, { 400: 'Nom d’article invalide.' }));
      }
    });
    extraName.focus();
  });

  validateButton.addEventListener('click', () => {
    const purchases: Purchase[] = [...checks.products].map(([productId, quantity]) => ({ productId, quantity }));
    const extraItemIds = [...checks.extraItemIds];
    const count = purchases.length + extraItemIds.length;
    validateButton.disabled = true;
    void (async () => {
      try {
        const updated = await validatePurchases({ purchases, extraItemIds });
        checks.products.clear();
        checks.extraItemIds.clear();
        message.show(
          count === 1 ? 'Achat validé : le stock est à jour.' : `${count} achats validés : le stock est à jour.`,
          'ok',
        );
        setList(updated);
      } catch (error) {
        message.show(errorMessage(error));
        updateValidateButton();
      }
    })();
  });

  const view = h(
    'section',
    {},
    summary,
    filter.element,
    message.element,
    products,
    h('section', { class: 'category' }, h('h3', {}, 'Autres articles'), extraList, extraForm),
    h('div', { class: 'purchase-bar' }, validateButton),
  );
  // The list depends on the stock, which other family members change.
  function onVisible(): void {
    if (!view.isConnected) {
      document.removeEventListener('visibilitychange', onVisible);
    } else if (document.visibilityState === 'visible') {
      void refresh();
    }
  }
  document.addEventListener('visibilitychange', onVisible);

  updateValidateButton();
  void refresh();
  return view;
}
