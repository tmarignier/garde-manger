import { errorMessage, getProductHistory } from '../api.ts';
import { groupEvents } from '../../shared/product-history.ts';
import type { ProductEventGroup } from '../../shared/product-history.ts';
import { roundQuantity } from '../../shared/products.ts';
import type { Product, ProductChange, ProductEvent, ProductField } from '../../shared/types.ts';
import { h, messageLine } from '../dom.ts';
import { formatDay, formatQuantity, formatTime } from '../format.ts';

const FIELD_LABELS: Record<ProductField, string> = {
  name: 'nom',
  categoryName: 'catégorie',
  unit: 'unité',
  minQuantity: 'seuil',
  targetQuantity: 'cible',
};

function formatValue(value: string | number | null): string {
  if (value === null) {
    return '—';
  }
  return typeof value === 'number' ? formatQuantity(value) : `« ${value} »`;
}

function formatChange(change: ProductChange): string {
  return `${FIELD_LABELS[change.field]} ${formatValue(change.before)} → ${formatValue(change.after)}`;
}

function formatDelta(group: ProductEventGroup): string {
  const delta = roundQuantity((group.quantityAfter ?? 0) - (group.quantityBefore ?? 0));
  return delta < 0 ? `−${formatQuantity(-delta)}` : `+${formatQuantity(delta)}`;
}

function quantityChange(group: ProductEventGroup): string {
  return `${formatValue(group.quantityBefore)} → ${formatValue(group.quantityAfter)}`;
}

// What a line of the history says, in French: a short label and its details.
export function describeEvent(group: ProductEventGroup): { label: string; detail: string } {
  switch (group.kind) {
    case 'created':
      return {
        label: 'Ajouté',
        detail: [`quantité ${formatValue(group.quantityAfter ?? 0)}`, ...group.changes
          .filter((change) => change.field !== 'name' && change.after !== null)
          .map((change) => `${FIELD_LABELS[change.field]} ${formatValue(change.after)}`)].join(', '),
      };
    case 'adjusted':
      return {
        label: group.count > 1 ? `${formatDelta(group)} (${group.count} fois)` : formatDelta(group),
        detail: quantityChange(group),
      };
    case 'purchased':
      return { label: `Courses ${formatDelta(group)}`, detail: quantityChange(group) };
    case 'edited':
      return {
        label: 'Fiche modifiée',
        detail: [
          ...group.changes.map(formatChange),
          ...(group.quantityBefore === null ? [] : [`quantité ${quantityChange(group)}`]),
        ].join(', '),
      };
    case 'deleted':
      return { label: 'Supprimé', detail: '' };
  }
}

// Lines of the history, by local day, most recent first.
function byDay(groups: readonly ProductEventGroup[]): { day: string; groups: ProductEventGroup[] }[] {
  const days: { day: string; groups: ProductEventGroup[] }[] = [];
  for (const group of groups) {
    const day = formatDay(new Date(group.createdAt));
    const last = days.at(-1);
    if (last?.day === day) {
      last.groups.push(group);
    } else {
      days.push({ day, groups: [group] });
    }
  }
  return days;
}

// Said once every event is shown: changes made before the history existed
// are not known.
function startNote(events: readonly ProductEvent[]): string {
  if (events.length === 0) {
    return 'Aucune modification enregistrée pour l’instant.';
  }
  return events.at(-1)?.kind === 'created'
    ? ''
    : 'Les modifications faites avant la version 1.3.0 de l’application ne sont pas connues.';
}

function eventItem(group: ProductEventGroup): HTMLLIElement {
  const { label, detail } = describeEvent(group);
  return h(
    'li',
    {},
    h('span', { class: 'history-time' }, formatTime(new Date(group.createdAt))),
    h('span', { class: 'history-what' }, h('strong', {}, label), ' ', group.userName),
    detail === '' ? null : h('span', { class: 'history-detail' }, detail),
  );
}

// The history of a product, shown under it in the stock: who changed what,
// and when, loaded 50 events at a time.
export function productHistory(product: Product): HTMLElement {
  let events: ProductEvent[] = [];
  const days = h('div');
  const more = h('button', { type: 'button', class: 'secondary' }, 'Voir plus');
  more.hidden = true;
  const note = h('p', { class: 'hint' });
  const message = messageLine();

  function render(hasMore: boolean): void {
    days.replaceChildren(
      ...byDay(groupEvents(events)).map(({ day, groups }) =>
        h('section', {}, h('h4', {}, day), h('ul', { class: 'history' }, ...groups.map(eventItem))),
      ),
    );
    more.hidden = !hasMore;
    note.textContent = hasMore ? '' : startNote(events);
  }

  async function load(): Promise<void> {
    more.disabled = true;
    try {
      const page = await getProductHistory(product.id, events.at(-1)?.id ?? null);
      events = [...events, ...page.events];
      render(page.hasMore);
    } catch (error) {
      message.show(errorMessage(error, { 404: `« ${product.name} » a été supprimé entre-temps.` }));
    } finally {
      more.disabled = false;
    }
  }

  more.addEventListener('click', () => void load());
  void load();
  return h(
    'section',
    { class: 'product-history' },
    h('h3', {}, `Historique de « ${product.name} »`),
    message.element,
    days,
    more,
    note,
  );
}
