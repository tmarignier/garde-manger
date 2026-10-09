import { errorMessage, logIn } from '../api.ts';
import type { User } from '../../shared/types.ts';
import { field, h, messageLine, whileSubmitting } from '../dom.ts';
import { nameInput, passwordInput } from './credentials.ts';

export function loginView(onDone: (user: User) => void): HTMLElement {
  const name = nameInput('username');
  const password = passwordInput('password', 'current');
  const message = messageLine();
  const form = h(
    'form',
    {},
    field('Prénom', name),
    field('Mot de passe', password),
    h('button', { type: 'submit' }, 'Se connecter'),
    message.element,
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void whileSubmitting(form, async () => {
      try {
        onDone(await logIn({ name: name.value, password: password.value }));
      } catch (error) {
        message.show(errorMessage(error, { 401: 'Prénom ou mot de passe incorrect.' }));
        password.value = '';
      }
    });
  });

  return h(
    'section',
    {},
    h('h2', {}, 'Connexion'),
    form,
    h('p', { class: 'hint' }, 'Mot de passe oublié ? Demandez à l’administrateur de le réinitialiser.'),
  );
}
