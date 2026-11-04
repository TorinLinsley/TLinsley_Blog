export function dateText(value: unknown): string {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  if (typeof value === 'number') return new Date(value).toISOString().slice(0, 10);
  if (typeof value === 'string') return value;
  return '';
}

export function dayText(value: unknown): string {
  const s = dateText(value);
  if (!s) return '';
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : s.split(' ')[0];
}
