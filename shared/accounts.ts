// Account rules shared by the server (validation) and the client (form hints).

export const NAME_MAX_LENGTH = 50;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

// Returns the trimmed name, or null when it is empty or too long.
export function normalizeName(value: string): string | null {
  const name = value.normalize('NFC').trim();
  return name.length > 0 && name.length <= NAME_MAX_LENGTH ? name : null;
}

export function isValidPassword(value: string): boolean {
  return value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH;
}

// The key two names are compared by: 'Élise' and 'élise' are the same account.
export function nameKey(name: string): string {
  return name.normalize('NFC').trim().toLocaleLowerCase('fr');
}
