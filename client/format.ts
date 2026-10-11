// French formats for quantities and dates, shared by the screens.

export function formatQuantity(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

// "Aujourd’hui", "Hier", "lundi 6 octobre", or with the year when it is not
// the current one.
export function formatDay(date: Date, now = new Date()): string {
  if (isSameDay(date, now)) {
    return 'Aujourd’hui';
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return 'Hier';
  }
  const day = date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
  return day.charAt(0).toUpperCase() + day.slice(1);
}
