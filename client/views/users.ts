import { createUser, deleteUser, errorMessage, listUsers, resetPassword } from '../api.ts';
import type { User } from '../../shared/types.ts';
import { field, h, messageLine, whileSubmitting } from '../dom.ts';
import { nameInput, passwordHint, passwordInput } from './credentials.ts';

// Admin screen: lists the family's accounts, creates, resets and deletes them.
export function usersView(currentUser: User): HTMLElement {
  const list = h('ul', { class: 'users' });
  const listMessage = messageLine();

  async function refresh(): Promise<void> {
    try {
      const users = await listUsers();
      list.replaceChildren(...users.map((user) => userItem(user)));
    } catch (error) {
      listMessage.show(errorMessage(error));
    }
  }

  function userItem(user: User): HTMLLIElement {
    const isSelf = user.id === currentUser.id;
    const resetButton = h('button', { type: 'button', class: 'secondary' }, 'Réinitialiser le mot de passe');
    const deleteButton = isSelf ? null : h('button', { type: 'button', class: 'danger' }, 'Supprimer');
    const resetSlot = h('div');
    const item = h(
      'li',
      {},
      h('div', { class: 'user-name' }, user.name, user.isAdmin ? h('span', { class: 'badge' }, 'administrateur') : null),
      h('div', { class: 'actions' }, resetButton, deleteButton ?? null),
      resetSlot,
    );

    resetButton.addEventListener('click', () => {
      resetSlot.replaceChildren(resetForm(user, () => resetSlot.replaceChildren()));
    });
    deleteButton?.addEventListener('click', () => {
      if (!window.confirm(`Supprimer le compte de ${user.name} ? Cette personne ne pourra plus se connecter.`)) {
        return;
      }
      void (async () => {
        try {
          await deleteUser(user.id);
          listMessage.show(`Le compte de ${user.name} a été supprimé.`, 'ok');
          await refresh();
        } catch (error) {
          listMessage.show(errorMessage(error, { 404: 'Ce compte n’existe plus.' }));
        }
      })();
    });
    return item;
  }

  function resetForm(user: User, close: () => void): HTMLFormElement {
    const password = passwordInput('password', 'new');
    const message = messageLine();
    const cancel = h('button', { type: 'button', class: 'secondary' }, 'Annuler');
    const form = h(
      'form',
      { class: 'inline-form' },
      field(`Nouveau mot de passe pour ${user.name}`, password),
      h('p', { class: 'hint' }, passwordHint),
      h('div', { class: 'actions' }, h('button', { type: 'submit' }, 'Enregistrer'), cancel),
      message.element,
    );
    cancel.addEventListener('click', close);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void whileSubmitting(form, async () => {
        try {
          await resetPassword(user.id, { password: password.value });
          close();
          listMessage.show(
            `Mot de passe de ${user.name} réinitialisé. Ses appareils devront se reconnecter avec le nouveau mot de passe.`,
            'ok',
          );
        } catch (error) {
          message.show(errorMessage(error, { 404: 'Ce compte n’existe plus.' }));
        }
      });
    });
    return form;
  }

  const name = nameInput('off');
  const password = passwordInput('password', 'new');
  const isAdmin = h('input', { type: 'checkbox', name: 'is-admin' });
  const createMessage = messageLine();
  const createForm = h(
    'form',
    {},
    field('Prénom', name),
    field('Mot de passe', password),
    h('p', { class: 'hint' }, passwordHint),
    h('label', { class: 'checkbox' }, isAdmin, 'Administrateur (peut gérer les comptes)'),
    h('button', { type: 'submit' }, 'Créer le compte'),
    createMessage.element,
  );
  createForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void whileSubmitting(createForm, async () => {
      try {
        const user = await createUser({ name: name.value, password: password.value, isAdmin: isAdmin.checked });
        createForm.reset();
        createMessage.show(
          `Compte de ${user.name} créé. Transmettez le prénom et le mot de passe à la personne pour qu’elle se connecte.`,
          'ok',
        );
        await refresh();
      } catch (error) {
        createMessage.show(errorMessage(error, { 409: 'Ce prénom est déjà utilisé.' }));
      }
    });
  });

  void refresh();

  return h(
    'section',
    {},
    h('h2', {}, 'Comptes de la famille'),
    list,
    listMessage.element,
    h('h3', {}, 'Créer un compte'),
    createForm,
  );
}
