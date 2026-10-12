/** Local YYYY-MM-DD (avoids UTC off-by-one from Date.parse). */
export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateOnly(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day) return null;
  return d;
}

export function getLocalDateOnly(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : toDateOnly(date);
}

export function isValidTransactionDate(value: string, now = new Date()): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = parseDateOnly(value);
    return date !== null && value <= toDateOnly(now);
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() <= now.getTime();
}

export function formatDateOnly(dateStr: string): string {
  const d = parseDateOnly(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
