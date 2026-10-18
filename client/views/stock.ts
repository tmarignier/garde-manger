import {
  adjustProduct,
  createCategory,
  createProduct,
  deleteProduct,
  errorMessage,
  listCategories,
  listProducts,
  renameCategory,
  updateProduct,
} from '../api.ts';
import { nameKey } from '../../shared/accounts.ts';
import {
  CATEGORY_NAME_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  SHOP_LINKS_MAX,
  SHOP_LINK_LABEL_MAX_LENGTH,
  SHOP_URL_MAX_LENGTH,
  UNIT_MAX_LENGTH,
  groupProducts,
  isBelowMinimum,
  isOutOfStock,
  isValidTarget,
  matchesSearch,
  matchesStockFilter,
  parseQuantity,
  parseShopUrl,
  type StockFilter,
} from '../../shared/products.ts';
import type { Category, Product, ProductRequest, ShopLink } from '../../shared/types.ts';
import { field, h, messageLine, whileSubmitting } from '../dom.ts';
import { formatQuantity, formatTime } from '../format.ts';
import { categoryFilter } from './category-filter.ts';
import { productHistory } from './product-history.ts';

const UNIT_SUGGESTIONS = ['paquets', 'boîtes', 'bouteilles', 'pots', 'sachets', 'rouleaux', 'pièces', 'kg', 'g', 'L'];
const NEW_CATEGORY = 'new';
const FILTERS_KEY = 'garde-manger.stock-filters';

type SavedFilters = { search: string; filter: string };

// The search and filter are kept for the session, so that a trip to the
// shopping list does not lose them. Storage can be unavailable (private
// browsing): they then reset with the screen.
function loadFilters(): SavedFilters {
  try {
    const data: unknown = JSON.parse(sessionStorage.getItem(FILTERS_KEY) ?? 'null');
    if (
      typeof data === 'object' &&
      data !== null &&
      'search' in data &&
      'filter' in data &&
      typeof data.search === 'string' &&
      typeof data.filter === 'string'
    ) {
      return { search: data.search, filter: data.filter };
    }
  } catch {
    // Unreadable or unavailable storage: start without search or filter.
  }
  return { search: '', filter: 'all' };
}

function saveFilters(filters: SavedFilters): void {
  try {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // See loadFilters.
  }
}

const COLLAPSED_KEY = 'garde-manger.collapsed-categories';

// The categories folded on this device, by id ('none' for the products
// without a category). Kept between visits; each device folds its own.
function loadCollapsed(): Set<string> {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
    if (Array.isArray(data)) {
      return new Set(data.filter((key): key is string => typeof key === 'string'));
    }
  } catch {
    // Unreadable or unavailable storage: every category is open.
  }
  return new Set();
}

function saveCollapsed(collapsed: ReadonlySet<string>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // See loadCollapsed.
  }
}

function countLabel(count: number): string {
  return count === 1 ? '1 produit' : `${count} produits`;
}

function formatUpdate(product: Product): string {
  const date = new Date(product.updatedAt);
  const time = formatTime(date);
  const day =
    date.toDateString() === new Date().toDateString()
      ? `aujourd’hui à ${time}`
      : `le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${time}`;
  return product.updatedByName === null ? `Modifié ${day}` : `Modifié par ${product.updatedByName} ${day}`;
}

function quantityInput(name: string, value: number | null, required: boolean): HTMLInputElement {
  return h('input', {
    type: 'text',
    name,
    inputmode: 'decimal',
    autocomplete: 'off',
    required,
    value: value === null ? '' : formatQuantity(value),
  });
}

// The stock screen: products grouped by category, search, quick + and − buttons,
// and the forms to add, edit and delete products and to add and rename categories.
export function stockView(): HTMLElement {
  let products: Product[] = [];
  let categories: Category[] = [];
  let loaded = false;

  const search = h('input', {
    type: 'search',
    name: 'search',
    placeholder: 'Rechercher un produit',
    'aria-label': 'Rechercher un produit',
    autocomplete: 'off',
  });
  const filter = categoryFilter(onFilterChange, { statuses: true });
  const saved = loadFilters();
  search.value = saved.search;
  filter.restore(saved.filter);
  const addButton = h('button', { type: 'button' }, 'Ajouter');
  const addSlot = h('div');
  const message = messageLine();
  const summary = h('p', { class: 'summary' });
  const list = h('div', { class: 'stock' });
  const collapsed = loadCollapsed();
  const categoryList = h('ul', { class: 'category-list' });
  const items = new Map<number, HTMLLIElement>();

  async function refresh(): Promise<void> {
    try {
      [products, categories] = await Promise.all([listProducts(), listCategories()]);
      loaded = true;
      render();
    } catch (error) {
      message.show(errorMessage(error));
    }
  }

  function onFilterChange(): void {
    saveFilters({ search: search.value, filter: filter.state() });
    render();
  }

  function render(): void {
    items.clear();
    if (loaded) {
      filter.update(categories, products);
    }
    const query = search.value.trim();
    const current = filter.value();
    const shown = products.filter(
      (product) => matchesStockFilter(product, current) && matchesSearch(product, query, categoryNameOf(product)),
    );
    const groups = groupProducts(shown, categories);
    // Left empty when nothing is shown: the list then says why.
    summary.textContent =
      !loaded || shown.length === 0
        ? ''
        : shown.length === products.length
          ? `${countLabel(products.length)} dans le stock.`
          : `${countLabel(shown.length)} sur ${products.length}.`;
    // Folding only applies to the whole stock: a search or a filter shows
    // everything it finds.
    const foldable = query === '' && current === 'all';
    if (!loaded) {
      list.replaceChildren(h('p', { class: 'message' }, 'Chargement…'));
    } else if (products.length === 0) {
      list.replaceChildren(
        h('p', { class: 'message' }, 'Aucun produit pour l’instant. Commencez par « Ajouter ».'),
      );
    } else if (groups.length === 0) {
      list.replaceChildren(...noMatch(query, current));
    } else {
      list.replaceChildren(
        ...groups.map((group) => categorySection(group.category, group.products, foldable)),
      );
    }
    categoryList.replaceChildren(...categories.map(categoryItem));
  }

  function categoryNameOf(product: Product): string {
    return categories.find((category) => category.id === product.categoryId)?.name ?? '';
  }

  // A category of the list, with its products. Its title shows how many
  // products it has and, on the whole stock, folds or unfolds it.
  function categorySection(category: Category | null, shown: Product[], foldable: boolean): HTMLElement {
    const name = category?.name ?? 'Sans catégorie';
    const products = h('ul', { class: 'products' }, ...shown.map(productItem));
    const count = h('span', { class: 'category-count' }, String(shown.length));
    if (!foldable) {
      return h('section', { class: 'category' }, h('h3', {}, name, count), products);
    }
    const key = category === null ? 'none' : String(category.id);
    const toggle = h(
      'button',
      { type: 'button', class: 'category-toggle', 'aria-expanded': collapsed.has(key) ? 'false' : 'true' },
      name,
      count,
    );
    products.hidden = collapsed.has(key);
    toggle.addEventListener('click', () => {
      if (collapsed.has(key)) {
        collapsed.delete(key);
      } else {
        collapsed.add(key);
      }
      saveCollapsed(collapsed);
      products.hidden = collapsed.has(key);
      toggle.setAttribute('aria-expanded', products.hidden ? 'false' : 'true');
    });
    return h('section', { class: 'category' }, h('h3', {}, toggle), products);
  }

  // What the list says when nothing matches. A search that only finds
  // products outside the filter offers to search the whole stock; one that
  // finds nothing offers to add the product, so it is not added twice.
  function noMatch(query: string, current: StockFilter): Node[] {
    if (query === '') {
      const text =
        current === 'low'
          ? 'Rien à racheter : tout est au-dessus de son seuil minimum.'
          : current === 'out'
            ? 'Aucun produit en rupture.'
            : 'Aucun produit dans cette catégorie.';
      return [h('p', { class: 'message' }, text)];
    }
    if (current !== 'all' && products.some((product) => matchesSearch(product, query, categoryNameOf(product)))) {
      const everywhere = h('button', { type: 'button', class: 'secondary' }, 'Chercher dans tout le stock');
      everywhere.addEventListener('click', () => {
        filter.restore('all');
        onFilterChange();
      });
      return [h('p', { class: 'message' }, `Aucun produit de ce filtre ne correspond à « ${query} ».`), everywhere];
    }
    const add = h('button', { type: 'button', class: 'secondary' }, `Ajouter « ${query} »`);
    add.addEventListener('click', () => openAddForm(query));
    return [h('p', { class: 'message' }, `Aucun produit ne correspond à « ${query} ».`), add];
  }

  // A category of the list, with a button that opens the form to rename it.
  function categoryItem(category: Category): HTMLLIElement {
    const renameButton = h(
      'button',
      { type: 'button', class: 'link', 'aria-label': `Renommer la catégorie ${category.name}` },
      'Renommer',
    );
    const row = h('div', { class: 'category-row' }, h('span', {}, category.name), renameButton);
    const item = h('li', {}, row);
    renameButton.addEventListener('click', () => {
      const form = renameForm(category, () => form.replaceWith(row));
      row.replaceWith(form);
      form.querySelector('input')?.select();
    });
    return item;
  }

  function renameForm(category: Category, close: () => void): HTMLFormElement {
    const name = h('input', {
      type: 'text',
      name: 'category-name',
      required: true,
      maxlength: String(CATEGORY_NAME_MAX_LENGTH),
      autocomplete: 'off',
      autocapitalize: 'sentences',
      value: category.name,
    });
    const cancel = h('button', { type: 'button', class: 'secondary' }, 'Annuler');
    const formMessage = messageLine();
    const form = h(
      'form',
      { class: 'inline-form' },
      field('Nouveau nom', name),
      h('div', { class: 'actions' }, h('button', { type: 'submit' }, 'Enregistrer'), cancel),
      formMessage.element,
    );
    cancel.addEventListener('click', close);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void whileSubmitting(form, async () => {
        try {
          const renamed = await renameCategory(category.id, name.value);
          categoryMessage.show(`Catégorie « ${category.name} » renommée en « ${renamed.name} ».`, 'ok');
          await refresh();
        } catch (error) {
          formMessage.show(
            errorMessage(error, {
              400: 'Nom de catégorie invalide.',
              404: 'Cette catégorie a été supprimée entre-temps.',
              409: 'Une autre catégorie porte déjà ce nom.',
            }),
          );
        }
      });
    });
    return form;
  }

  function replaceProduct(product: Product): void {
    products = products.map((existing) => (existing.id === product.id ? product : existing));
    items.get(product.id)?.replaceWith(productItem(product));
    // Updates the counts of the chips; the list itself is left as is, so that
    // a product does not vanish under the thumb when it leaves the filter.
    filter.update(categories, products);
  }

  function productItem(product: Product): HTMLLIElement {
    const unit = product.unit === '' ? '' : ` ${product.unit}`;
    const nameButton = h('button', { type: 'button', class: 'link product-name' }, product.name);
    const minus = h(
      'button',
      { type: 'button', class: 'step', 'aria-label': `Retirer 1 : ${product.name}`, disabled: product.quantity <= 0 },
      '−',
    );
    const plus = h('button', { type: 'button', class: 'step', 'aria-label': `Ajouter 1 : ${product.name}` }, '+');
    // Shows the product's form or its history under it, or closes what is open.
    const editSlot = h('div');
    function toggle(content: 'form' | 'history'): void {
      const open = editSlot.dataset['content'];
      editSlot.replaceChildren();
      delete editSlot.dataset['content'];
      if (open === content) {
        return;
      }
      editSlot.dataset['content'] = content;
      editSlot.append(
        content === 'form'
          ? productForm(product, () => toggle('form'), { meta: productMeta(product, () => toggle('history')) })
          : productHistory(product),
      );
    }
    const item = h(
      'li',
      { 'data-low': isBelowMinimum(product) ? 'true' : undefined, 'data-out': isOutOfStock(product) ? 'true' : undefined },
      h(
        'div',
        { class: 'product-row' },
        nameButton,
        h(
          'span',
          { class: 'quantity' },
          `${formatQuantity(product.quantity)}${unit}`,
          isOutOfStock(product)
            ? h('span', { class: 'badge out' }, 'en rupture')
            : isBelowMinimum(product)
              ? h('span', { class: 'badge low' }, 'à racheter')
              : null,
        ),
        h('div', { class: 'stepper' }, minus, plus),
      ),
      editSlot,
    );
    items.set(product.id, item);

    function adjust(delta: number): void {
      minus.disabled = true;
      plus.disabled = true;
      void (async () => {
        try {
          replaceProduct(await adjustProduct(product.id, delta));
        } catch (error) {
          message.show(errorMessage(error, { 404: `« ${product.name} » a été supprimé entre-temps.` }));
          await refresh();
        }
      })();
    }

    minus.addEventListener('click', () => adjust(-1));
    plus.addEventListener('click', () => adjust(1));
    nameButton.addEventListener('click', () => toggle('form'));
    return item;
  }

  // Who changed the product last, with a button to its history. Shown in the
  // product's form, to keep the list one line per product.
  function productMeta(product: Product, showHistory: () => void): HTMLParagraphElement {
    const historyButton = h('button', { type: 'button', class: 'link' }, 'Historique');
    historyButton.addEventListener('click', showHistory);
    return h('p', { class: 'product-meta' }, formatUpdate(product), ' · ', historyButton);
  }

  // The form to add a product (product null), with an optional first name, or
  // edit one, with its meta line.
  function productForm(
    product: Product | null,
    close: () => void,
    options: { meta?: Node; name?: string } = {},
  ): HTMLFormElement {
    const name = h('input', {
      type: 'text',
      name: 'name',
      required: true,
      maxlength: String(PRODUCT_NAME_MAX_LENGTH),
      autocomplete: 'off',
      autocapitalize: 'sentences',
      value: product?.name ?? options.name ?? '',
    });
    const category = h(
      'select',
      { name: 'category' },
      h('option', { value: '' }, 'Sans catégorie'),
      ...categories.map((existing) =>
        h('option', { value: String(existing.id), selected: existing.id === product?.categoryId }, existing.name),
      ),
      h('option', { value: NEW_CATEGORY }, 'Nouvelle catégorie…'),
    );
    const newCategory = h('input', {
      type: 'text',
      name: 'new-category',
      maxlength: String(CATEGORY_NAME_MAX_LENGTH),
      autocomplete: 'off',
      autocapitalize: 'sentences',
    });
    const newCategoryField = field('Nom de la nouvelle catégorie', newCategory);
    newCategoryField.hidden = true;
    category.addEventListener('change', () => {
      newCategoryField.hidden = category.value !== NEW_CATEGORY;
      newCategory.required = category.value === NEW_CATEGORY;
    });
    const unitListId = `units-${product?.id ?? 'new'}`;
    const unit = h('input', {
      type: 'text',
      name: 'unit',
      maxlength: String(UNIT_MAX_LENGTH),
      autocomplete: 'off',
      list: unitListId,
      value: product?.unit ?? '',
    });
    const quantity = quantityInput('quantity', product?.quantity ?? 0, true);
    const minQuantity = quantityInput('min-quantity', product?.minQuantity ?? 1, true);
    const targetQuantity = quantityInput('target-quantity', product?.targetQuantity ?? null, false);
    const shopLinks = shopLinksEditor(product?.shopLinks ?? []);
    const formMessage = messageLine();
    const cancel = h('button', { type: 'button', class: 'secondary' }, 'Annuler');
    const remove = product === null ? null : h('button', { type: 'button', class: 'danger' }, 'Supprimer');

    const form = h(
      'form',
      { class: 'inline-form product-form' },
      h('h3', {}, product === null ? 'Nouveau produit' : `Modifier « ${product.name} »`),
      options.meta ?? null,
      field('Nom', name),
      h('label', { class: 'field' }, h('span', {}, 'Catégorie'), category),
      newCategoryField,
      field('Unité', unit),
      h('datalist', { id: unitListId }, ...UNIT_SUGGESTIONS.map((suggestion) => h('option', { value: suggestion }))),
      h('p', { class: 'hint' }, 'Par exemple : paquets, boîtes, kg. Laisser vide pour compter à l’unité.'),
      h('div', { class: 'quantities' }, field('Quantité', quantity), field('Seuil minimum', minQuantity)),
      h('p', { class: 'hint' }, 'Sous le seuil minimum, le produit passe dans la liste de courses.'),
      field('Quantité cible (facultatif)', targetQuantity),
      h('p', { class: 'hint' }, 'La quantité à avoir après les courses. Sans cible, on remonte jusqu’au seuil.'),
      shopLinks.element,
      h('div', { class: 'actions' }, h('button', { type: 'submit' }, 'Enregistrer'), cancel, remove),
      formMessage.element,
    );

    cancel.addEventListener('click', close);
    remove?.addEventListener('click', () => {
      if (product === null || !window.confirm(`Supprimer « ${product.name} » du stock ?`)) {
        return;
      }
      void whileSubmitting(form, async () => {
        try {
          await deleteProduct(product.id);
          message.show(`« ${product.name} » a été supprimé.`, 'ok');
        } catch (error) {
          formMessage.show(errorMessage(error, { 404: 'Ce produit a déjà été supprimé.' }));
        }
      }).then(refresh);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = {
        quantity: parseQuantity(quantity.value),
        minQuantity: parseQuantity(minQuantity.value),
        targetQuantity: targetQuantity.value.trim() === '' ? null : parseQuantity(targetQuantity.value),
      };
      if (
        values.quantity === null ||
        values.minQuantity === null ||
        (targetQuantity.value.trim() !== '' && values.targetQuantity === null)
      ) {
        formMessage.show('Les quantités doivent être des nombres positifs, par exemple 2 ou 1,5.');
        return;
      }
      const { quantity: quantityValue, minQuantity: minQuantityValue, targetQuantity: targetValue } = values;
      if (!isValidTarget(minQuantityValue, targetValue)) {
        formMessage.show('La quantité cible ne peut pas être inférieure au seuil minimum.');
        return;
      }
      const shopLinksValue = shopLinks.read();
      if (shopLinksValue === null) {
        formMessage.show('Chaque lien de commande doit être une adresse web, par exemple https://lafourche.fr/…');
        return;
      }
      // An untouched quantity is not sent, so that a + or − made meanwhile on
      // another device is kept.
      const quantityChanged = product === null || quantity.value !== quantity.defaultValue;
      void whileSubmitting(form, async () => {
        try {
          const request: ProductRequest = {
            name: name.value,
            categoryId: await chosenCategoryId(category.value, newCategory.value),
            unit: unit.value,
            quantity: quantityValue,
            minQuantity: minQuantityValue,
            targetQuantity: targetValue,
            shopLinks: shopLinksValue,
          };
          if (product === null) {
            const saved = await createProduct(request);
            message.show(`« ${saved.name} » a été ajouté.`, 'ok');
          } else {
            const { quantity: _quantity, ...fields } = request;
            await updateProduct(product.id, quantityChanged ? request : fields);
            message.show(`« ${request.name.trim()} » a été modifié.`, 'ok');
          }
          close();
          await refresh();
        } catch (error) {
          formMessage.show(
            errorMessage(error, {
              400: 'Vérifiez les champs du formulaire.',
              404: 'Ce produit a été supprimé entre-temps.',
            }),
          );
        }
      });
    });
    return form;
  }

  // The links of the product form: one row per reference of the product on an
  // online shop, with a name to tell them apart.
  function shopLinksEditor(initial: readonly ShopLink[]): {
    element: HTMLFieldSetElement;
    read: () => ShopLink[] | null;
  } {
    const rows = h('div', { class: 'shop-link-rows' });
    const add = h('button', { type: 'button', class: 'link' }, '+ Ajouter un lien');

    function updateAdd(): void {
      add.hidden = rows.children.length >= SHOP_LINKS_MAX;
    }

    function addRow(link: ShopLink | null): void {
      const label = h('input', {
        type: 'text',
        name: 'shop-link-label',
        maxlength: String(SHOP_LINK_LABEL_MAX_LENGTH),
        autocomplete: 'off',
        autocapitalize: 'sentences',
        placeholder: 'Nom, par exemple Barilla 500 g',
        'aria-label': 'Nom de la référence',
        value: link?.label ?? '',
      });
      const url = h('input', {
        type: 'text',
        inputmode: 'url',
        autocapitalize: 'none',
        spellcheck: 'false',
        name: 'shop-link-url',
        maxlength: String(SHOP_URL_MAX_LENGTH),
        autocomplete: 'off',
        placeholder: 'https://lafourche.fr/…',
        'aria-label': 'Adresse de la fiche du produit',
        value: link?.url ?? '',
      });
      const remove = h('button', { type: 'button', class: 'link remove' }, 'Retirer');
      const row = h('div', { class: 'shop-link-row' }, label, url, remove);
      remove.addEventListener('click', () => {
        row.remove();
        updateAdd();
      });
      rows.append(row);
      updateAdd();
    }

    for (const link of initial) {
      addRow(link);
    }
    add.addEventListener('click', () => {
      addRow(null);
      rows.lastElementChild?.querySelector('input')?.focus();
    });

    // Rows without an address are left out. Returns null when an address is invalid.
    function read(): ShopLink[] | null {
      const links: ShopLink[] = [];
      for (const row of rows.children) {
        const [label, url] = [...row.querySelectorAll('input')];
        if (label === undefined || url === undefined || url.value.trim() === '') {
          continue;
        }
        const parsed = parseShopUrl(url.value);
        if (parsed === null) {
          url.focus();
          return null;
        }
        links.push({ label: label.value.trim(), url: parsed });
      }
      return links;
    }

    const element = h(
      'fieldset',
      { class: 'shop-links-field' },
      h('legend', {}, 'Liens de commande en ligne (facultatif)'),
      h(
        'p',
        { class: 'hint' },
        'La fiche du produit sur le site où vous commandez (La Fourche, un drive…), une par référence achetée. ',
        'Dans la liste de courses, un bouton ouvre chaque fiche pour l’ajouter au panier.',
      ),
      rows,
      add,
    );
    return { element, read };
  }

  // The category picked in the product form, created first when it is new. A
  // new name that matches an existing category reuses it.
  async function chosenCategoryId(value: string, newName: string): Promise<number | null> {
    if (value === '') {
      return null;
    }
    if (value !== NEW_CATEGORY) {
      return Number(value);
    }
    const existing = categories.find((category) => nameKey(category.name) === nameKey(newName));
    if (existing !== undefined) {
      return existing.id;
    }
    const category = await createCategory(newName);
    categories = [...categories, category];
    return category.id;
  }

  // Opens the form to add a product, or brings back the one already open. A
  // name typed in the search fills the form's name.
  function openAddForm(name = ''): void {
    const open = addSlot.querySelector('form');
    const form =
      open ??
      productForm(
        null,
        () => {
          addSlot.replaceChildren();
          addButton.hidden = false;
        },
        { name },
      );
    const nameInput = form.querySelector<HTMLInputElement>('input[name="name"]');
    if (open !== null && name !== '' && nameInput !== null) {
      nameInput.value = name;
    }
    if (open === null) {
      addSlot.replaceChildren(form);
      addButton.hidden = true;
    }
    nameInput?.focus();
  }

  addButton.addEventListener('click', () => openAddForm());
  search.addEventListener('input', onFilterChange);

  const categoryName = h('input', {
    type: 'text',
    name: 'category-name',
    required: true,
    maxlength: String(CATEGORY_NAME_MAX_LENGTH),
    autocomplete: 'off',
    autocapitalize: 'sentences',
  });
  const categoryMessage = messageLine();
  const categoryForm = h(
    'form',
    { class: 'inline-form' },
    field('Nouvelle catégorie', categoryName),
    h('button', { type: 'submit' }, 'Ajouter la catégorie'),
    categoryMessage.element,
  );
  categoryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void whileSubmitting(categoryForm, async () => {
      try {
        const category = await createCategory(categoryName.value);
        categoryForm.reset();
        categoryMessage.show(`Catégorie « ${category.name} » ajoutée.`, 'ok');
        await refresh();
      } catch (error) {
        categoryMessage.show(
          errorMessage(error, { 400: 'Nom de catégorie invalide.', 409: 'Cette catégorie existe déjà.' }),
        );
      }
    });
  });

  // Stays at the top while the list scrolls. Its height places the category
  // titles, which stay under it.
  const header = h('div', { class: 'stock-header' }, h('div', { class: 'toolbar' }, search, addButton), filter.element);
  const view = h(
    'section',
    {},
    header,
    addSlot,
    message.element,
    summary,
    list,
    h(
      'details',
      { class: 'categories' },
      h('summary', {}, 'Catégories'),
      categoryList,
      categoryForm,
    ),
  );
  // Other family members may have changed the stock while the app was in the
  // background: reload when it comes back.
  function onVisible(): void {
    if (!view.isConnected) {
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('keydown', onKey);
    } else if (document.visibilityState === 'visible') {
      void refresh();
    }
  }
  document.addEventListener('visibilitychange', onVisible);

  // Keyboard shortcuts on a computer: « / » goes to the search, Échap clears it.
  function onKey(event: KeyboardEvent): void {
    if (!view.isConnected) {
      document.removeEventListener('keydown', onKey);
      return;
    }
    const target = event.target;
    const typing =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      search.focus();
      search.select();
    } else if (event.key === 'Escape' && target === search && search.value !== '') {
      event.preventDefault();
      search.value = '';
      onFilterChange();
    }
  }
  document.addEventListener('keydown', onKey);
  new ResizeObserver(() => {
    view.style.setProperty('--header-height', `${header.offsetHeight}px`);
  }).observe(header);

  render();
  void refresh();
  return view;
}
