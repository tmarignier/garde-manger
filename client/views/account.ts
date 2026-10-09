import { changePassword, errorMessage } from '../api.ts';
import type { User } from '../../shared/types.ts';
import { field, h, messageLine, whileSubmitting } from '../dom.ts';
import { checkConfirmation, passwordHint, passwordInput } from './credentials.ts';

// The logged-in user's own account: changing the password.
export function accountView(user: User): HTMLElement {
  const currentPassword = passwordInput('current-password', 'current');
  const newPassword = passwordInput('new-password', 'new');
  const confirmation = passwordInput('confirmation', 'new');
  const message = messageLine();
  const form = h(
    'form',
    {},
    field('Mot de passe actuel', currentPassword),
    field('Nouveau mot de passe', newPassword),
    h('p', { class: 'hint' }, passwordHint),
    field('Confirmer le nouveau mot de passe', confirmation),
    h('button', { type: 'submit' }, 'Changer le mot de passe'),
    message.element,
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const mismatch = checkConfirmation(newPassword, confirmation);
    if (mismatch !== null) {
      message.show(mismatch);
      return;
    }
    void whileSubmitting(form, async () => {
      try {
        await changePassword({ currentPassword: currentPassword.value, newPassword: newPassword.value });
        form.reset();
        message.show('Mot de passe changé. Vos autres appareils devront se reconnecter.', 'ok');
      } catch (error) {
        message.show(errorMessage(error, { 403: 'Le mot de passe actuel est incorrect.' }));
      }
    });
  });

  return h(
    'section',
    {},
    h('h2', {}, 'Mon compte'),
    h('p', {}, `Connecté en tant que ${user.name}${user.isAdmin ? ' (administrateur)' : ''}.`),
    h('h3', {}, 'Changer de mot de passe'),
    form,
  );
}
