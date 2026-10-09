import type { User } from '../../shared/types.ts';
import { h } from '../dom.ts';

// Placeholder until the stock screens arrive.
export function homeView(user: User): HTMLElement {
  return h(
    'section',
    {},
    h('h2', {}, `Bonjour ${user.name}`),
    h('p', {}, 'Le suivi du stock arrive bientôt.'),
  );
}
