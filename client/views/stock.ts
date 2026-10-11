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
  UNIT_MAX_LENGTH,
  groupProducts,
  isBelowMinimum,
  isValidTarget,
  matchesCategory,
  matchesSearch,
  parseQuantity,
} from '../../shared/products.ts';
import type { Category, Product, ProductRequest } from '../../shared/types.ts';
import { field, h, messageLine, whileSubmitting } from '../dom.ts';
import { formatQuantity, formatTime } from '../format.ts';
import { categoryFilter } from './category-filter.ts';
import { productHistory } from './product-history.ts';

const UNIT_SUGGESTIONS = ['paquets', 'boîtes', 'bouteilles', 'pots', 'sachets', 'rouleaux', 'pièces', 'kg', 'g', 'L'];
const NEW_CATEGORY = 'new';

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
  const filter = categoryFilter(render);
  const addButton = h('button', { type: 'button' }, 'Ajouter un produit');
  const addSlot = h('div');
  const message = messageLine();
  const list = h('div', { class: 'stock' });
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

  function render(): void {
    items.clear();
    filter.update(categories, products);
    const query = search.value.trim();
    const category = filter.value();
    const shown = products.filter((product) => matchesCategory(product, category) && matchesSearch(product, query));
    const groups = groupProducts(shown, categories);
    if (!loaded) {
      list.replaceChildren(h('p', { class: 'message' }, 'Chargement…'));
    } else if (products.length === 0) {
      list.replaceChildren(
        h('p', { class: 'message' }, 'Aucun produit pour l’instant. Commencez par « Ajouter un produit ».'),
      );
    } else if (groups.length === 0) {
      list.replaceChildren(
        h(
          'p',
          { class: 'message' },
          query === '' ? 'Aucun produit dans cette catégorie.' : `Aucun produit ne correspond à « ${query} ».`,
        ),
      );
    } else {
      list.replaceChildren(
        ...groups.map((group) =>
          h(
            'section',
            { class: 'category' },
            h('h3', {}, group.category?.name ?? 'Sans catégorie'),
            h('ul', { class: 'products' }, ...group.products.map(productItem)),
          ),
        ),
      );
    }
    categoryList.replaceChildren(...categories.map(categoryItem));
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
    const historyButton = h('button', { type: 'button', class: 'link' }, 'Historique');
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
      editSlot.append(content === 'form' ? productForm(product, () => toggle('form')) : productHistory(product));
    }
    const item = h(
      'li',
      { 'data-low': isBelowMinimum(product) ? 'true' : undefined },
      h(
        'div',
        { class: 'product-row' },
        h(
          'div',
          { class: 'product-info' },
          nameButton,
          h(
            'span',
            { class: 'quantity' },
            `${formatQuantity(product.quantity)}${unit}`,
            isBelowMinimum(product) ? h('span', { class: 'badge low' }, 'à racheter') : null,
          ),
        ),
        h('div', { class: 'stepper' }, minus, plus),
      ),
      h('p', { class: 'product-meta' }, formatUpdate(product), ' · ', historyButton),
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
    historyButton.addEventListener('click', () => toggle('history'));
    return item;
  }

  // The form to add a product (product null) or edit one.
  function productForm(product: Product | null, close: () => void): HTMLFormElement {
    const name = h('input', {
      type: 'text',
      name: 'name',
      required: true,
      maxlength: String(PRODUCT_NAME_MAX_LENGTH),
      autocomplete: 'off',
      autocapitalize: 'sentences',
      value: product?.name ?? '',
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
    const formMessage = messageLine();
    const cancel = h('button', { type: 'button', class: 'secondary' }, 'Annuler');
    const remove = product === null ? null : h('button', { type: 'button', class: 'danger' }, 'Supprimer');

    const form = h(
      'form',
      { class: 'inline-form product-form' },
      h('h3', {}, product === null ? 'Nouveau produit' : `Modifier « ${product.name} »`),
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

  addButton.addEventListener('click', () => {
    if (addSlot.firstChild !== null) {
      return;
    }
    const form = productForm(null, () => {
      addSlot.replaceChildren();
      addButton.hidden = false;
    });
    addSlot.replaceChildren(form);
    addButton.hidden = true;
    form.querySelector('input')?.focus();
  });
  search.addEventListener('input', render);

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

  const view = h(
    'section',
    {},
    h('div', { class: 'toolbar' }, search, addButton),
    filter.element,
    addSlot,
    message.element,
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
    } else if (document.visibilityState === 'visible') {
      void refresh();
    }
  }
  document.addEventListener('visibilitychange', onVisible);

  render();
  void refresh();
  return view;
}
