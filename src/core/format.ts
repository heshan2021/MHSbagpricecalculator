/* Formatting helpers - identical output to the legacy pages. */

/** Decimal-safe half-up rounding to 2 decimals. Prevents binary float artefacts such as
 *  45.55 x 1.30 = 59.214999... displaying as 59.21 instead of the commercial 59.22.
 *  Intermediates are never rounded - only what the customer sees. */
export function round2(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const shifted = n * 100 + (n >= 0 ? 1e-7 : -1e-7);
  return Math.round(shifted) / 100;
}

export function lkr(value: unknown): string {
  const n = Number(value);
  return 'Rs. ' + (Number.isFinite(n) ? round2(n) : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function intFmt(value: unknown): string {
  return (Number(value) || 0).toLocaleString('en-US');
}

/** Decimal fraction -> percentage label. 0.3 -> '30%', 0.425 -> '42.5%', 0.4255 -> '42.55%' */
export function pct(value: unknown, decimals?: number): string {
  const n = Number(value) || 0;
  const out = (n * 100).toFixed(decimals == null ? 0 : decimals);
  return out.replace(/(\.\d*[1-9])0+$/, '$1').replace(/\.0+$/, '') + '%';
}
