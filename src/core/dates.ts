/* Date helpers - local-time safe, byte-identical output to the legacy pages. */

export function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function addDaysISO(iso: string | undefined, days: unknown): string {
  const d = new Date((iso || todayISO()) + 'T00:00:00');
  if (isNaN(d.getTime())) return todayISO();
  d.setDate(d.getDate() + (Number(days) || 0));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function fmtDate(iso: string | undefined): string {
  const d = new Date((iso || '') + 'T00:00:00');
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
