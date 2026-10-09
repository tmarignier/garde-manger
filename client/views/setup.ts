import { ApiError, errorMessage, setUp } from '../api.ts';
import type { User } from '../../shared/types.ts';
import { field, h, messageLine, whileSubmitting } from '../dom.ts';
import { checkConfirmation, nameInput, passwordHint, passwordInput } from './credentials.ts';

// First launch: creates the admin account.
export function setupView(onDone: (user: User) => void, onAlreadyDone: () => void): HTMLElement {
  const name = nameInput('username');
  const password = passwordInput('password', 'new');
  const confirmation = passwordInput('confirmation', 'new');
  const message = messageLine();
  const form = h(
    'form',
    {},
    field('Votre prénom', name),
    field('Mot de passe', password),
    h('p', { class: 'hint' }, passwordHint),
    field('Confirmer le mot de passe', confirmation),
    h('button', { type: 'submit' }, 'Créer le compte'),
    message.element,
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const mismatch = checkConfirmation(password, confirmation);
    if (mismatch !== null) {
      message.show(mismatch);
      return;
    }
    void whileSubmitting(form, async () => {
      try {
        onDone(await setUp({ name: name.value, password: password.value }));
      } catch (error) {
        message.show(errorMessage(error, { 409: 'Le premier compte a déjà été créé.' }));
        if (error instanceof ApiError && error.status === 409) {
          onAlreadyDone();
        }
      }
    });
  });

  return h(
    'section',
    {},
    h('h2', {}, 'Bienvenue'),
    h(
      'p',
      {},
      'Créez le premier compte. Ce sera le compte administrateur : il servira à créer les comptes des autres membres de la famille.',
    ),
    form,
  );
}
