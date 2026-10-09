import { NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../shared/accounts.ts';
import { h } from '../dom.ts';

export function nameInput(autocomplete: string): HTMLInputElement {
  return h('input', {
    type: 'text',
    name: 'name',
    required: true,
    maxlength: String(NAME_MAX_LENGTH),
    autocomplete,
    autocapitalize: 'words',
    spellcheck: 'false',
  });
}

// A password input. New passwords get the length rules, so the browser checks
// them before sending.
export function passwordInput(name: string, kind: 'current' | 'new'): HTMLInputElement {
  const attributes: Record<string, string | boolean> = {
    type: 'password',
    name,
    required: true,
    autocomplete: kind === 'current' ? 'current-password' : 'new-password',
  };
  if (kind === 'new') {
    attributes['minlength'] = String(PASSWORD_MIN_LENGTH);
    attributes['maxlength'] = String(PASSWORD_MAX_LENGTH);
  }
  return h('input', attributes);
}

export const passwordHint = `Au moins ${PASSWORD_MIN_LENGTH} caractères.`;

// Returns an error message when the two new passwords differ.
export function checkConfirmation(password: HTMLInputElement, confirmation: HTMLInputElement): string | null {
  return password.value === confirmation.value ? null : 'Les deux mots de passe ne correspondent pas.';
}
