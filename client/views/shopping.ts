import {
  ApiError,
  checkProduct,
  createExtraItem,
  deleteExtraItem,
  errorMessage,
  getShoppingList,
  listCategories,
  setExtraItemChecked,
  uncheckProduct,
  validatePurchases,
} from '../api.ts';
import {
  PRODUCT_NAME_MAX_LENGTH,
  groupProducts,
  matchesStockFilter,
  parseQuantity,
  shopLinkText,
} from '../../shared/products.ts';
import type {
  Category,
  ExtraItem,
  Purchase,
  ShopLink,
  ShoppingListItem,
  ShoppingListResponse,
} from '../../shared/types.ts';
import { h, messageLine, whileSubmitting } from '../dom.ts';
import { formatQuantity } from '../format.ts';
import { categoryFilter } from './category-filter.ts';

// What is checked during the shopping trip or the drive order: the bought
// quantity of each checked product, and the checked extra items. The server
// keeps them for the whole family until the purchases are validated; this copy
// is what the screen shows while its changes are being sent.
type Checks = {
  products: Map<number, number>;
  extraItemIds: Set<number>;
};

// Before version 1.6.0, checks were only kept on the device.
const DEVICE_CHECKS_KEY = 'garde-manger.shopping-checks';

// The checks left on this device by a previous version, or null.
function takeDeviceChecks(): Checks | null {
  try {
    const raw = localStorage.getItem(DEVICE_CHECKS_KEY);
    if (raw === null) {
      return null;
    }
    localStorage.removeItem(DEVICE_CHECKS_KEY);
    const checks: Checks = { products: new Map(), extraItemIds: new Set() };
    const data: unknown = JSON.parse(raw);
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
    return checks;
  } catch {
    // Unreadable or unavailable storage: nothing to bring back.
    return null;
  }
}

function withUnit(quantity: number, unit: string): string {
  return unit === '' ? formatQuantity(quantity) : `${formatQuantity(quantity)} ${unit}`;
}

// The shopping screen, made to be used with one hand in the shop: tap a row to
// check it, adjust the bought quantity if needed, then validate to add
// everything checked to the stock. Checks can also be made while ordering on a
// drive website and validated when the order is delivered.
export function shoppingView(): HTMLElement {
  let list: ShoppingListResponse | null = null;
  let categories: Category[] = [];
  const checks: Checks = { products: new Map(), extraItemIds: new Set() };
  // Changes to the checks are sent one after the other, so that the last tap
  // on a stepper is the one the server keeps.
  let saving: Promise<void> = Promise.resolve();
  let writeCount = 0;
  let deviceChecks = takeDeviceChecks();

  const filter = categoryFilter(render);
  filter.element.classList.add('shopping-chips');
  const summary = h('p', { class: 'message' }, 'Chargement…');
  const message = messageLine();
  const products = h('div', { class: 'shopping' });
  const extraList = h('ul', { class: 'shopping-items' });
  const validateButton = h('button', { type: 'button', class: 'validate' }, 'Valider les achats');

  function save(write: () => Promise<void>): void {
    writeCount++;
    saving = saving.then(write).catch((error: unknown) => {
      // Deleted meanwhile on another device: the refresh below shows it.
      if (!(error instanceof ApiError && error.status === 404)) {
        message.show(errorMessage(error));
      }
      void refresh();
    });
  }

  async function refresh(): Promise<void> {
    try {
      let loaded: [ShoppingListResponse, Category[]];
      let writesBefore: number;
      // A list loaded while checks were being sent would undo them on screen.
      do {
        await saving;
        writesBefore = writeCount;
        loaded = await Promise.all([getShoppingList(), listCategories()]);
      } while (writeCount !== writesBefore);
      categories = loaded[1];
      setList(loaded[0]);
      bringBackDeviceChecks();
    } catch (error) {
      message.show(errorMessage(error));
    }
  }

  // Takes the checks of the family, as the server keeps them.
  function setList(loaded: ShoppingListResponse): void {
    list = loaded;
    checks.products.clear();
    checks.extraItemIds.clear();
    for (const item of loaded.items) {
      if (item.boughtQuantity !== null) {
        checks.products.set(item.product.id, item.boughtQuantity);
      }
    }
    for (const extra of loaded.extraItems) {
      if (extra.checked) {
        checks.extraItemIds.add(extra.id);
      }
    }
    render();
  }

  // Sends to the server the checks a previous version kept on this device, so
  // that updating the app during a shopping trip loses nothing.
  function bringBackDeviceChecks(): void {
    if (deviceChecks === null || list === null) {
      return;
    }
    for (const item of list.items) {
      const quantity = deviceChecks.products.get(item.product.id);
      if (quantity !== undefined && !checks.products.has(item.product.id)) {
        setProductCheck(item.product.id, quantity);
      }
    }
    for (const extra of list.extraItems) {
      if (deviceChecks.extraItemIds.has(extra.id) && !checks.extraItemIds.has(extra.id)) {
        setExtraCheck(extra.id, true);
      }
    }
    deviceChecks = null;
    render();
  }

  function setProductCheck(productId: number, quantity: number | null): void {
    if (quantity === null) {
      checks.products.delete(productId);
      save(() => uncheckProduct(productId));
    } else {
      checks.products.set(productId, quantity);
      save(() => checkProduct(productId, quantity));
    }
  }

  function setExtraCheck(id: number, checked: boolean): void {
    if (checked) {
      checks.extraItemIds.add(id);
    } else {
      checks.extraItemIds.delete(id);
    }
    save(() => setExtraItemChecked(id, checked));
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
      listed.filter((product) => matchesStockFilter(product, category)),
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
        // Nothing left to buy when someone found some at home after it was checked.
        h('span', { class: 'item-quantity' }, quantityToBuy > 0 ? withUnit(quantityToBuy, product.unit) : ''),
      ),
      product.shopLinks.length === 0
        ? null
        : h('div', { class: 'shop-links' }, ...product.shopLinks.map((link) => shopLink(link, product.name))),
      checks.products.has(product.id) ? boughtQuantity(product.id, product.name, product.unit) : null,
    );
    checkbox.addEventListener('change', () => {
      setProductCheck(product.id, checkbox.checked ? Math.max(quantityToBuy, 1) : null);
      li.replaceWith(productItem(item));
      updateValidateButton();
    });
    return li;
  }

  // Opens the product's page on the online shop in a new tab, to add it to the
  // cart there. Coming back to the list, a tap checks it as ordered.
  function shopLink(link: ShopLink, name: string): HTMLAnchorElement {
    const text = shopLinkText(link);
    return h(
      'a',
      { class: 'shop-link', href: link.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${text} : ${name}` },
      `${text} ↗`,
    );
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
      setProductCheck(productId, quantity);
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
      setExtraCheck(extra.id, checkbox.checked);
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
        // A check still being sent would come back after the validation.
        await saving;
        const updated = await validatePurchases({ purchases, extraItemIds });
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
