/* Plain-text quotation for the clipboard and the printed page. Line for line identical
   to the legacy calculator. */
import type { FactorySettings } from './factory.ts';
import { fmtDate } from './dates.ts';
import { intFmt, lkr } from './format.ts';
import type { QuoteDetails, QuoteResult } from './pricing.ts';

/** Generated once per page load, exactly like the legacy calculator. */
export const QUOTE_REF = 'MHS-'
  + new Date().toISOString().slice(2, 10).replace(/-/g, '')
  + '-' + Math.floor(100 + Math.random() * 900);

export function buildQuoteText(settings: FactorySettings, quote: QuoteDetails, q: QuoteResult): string {
  const lines = [
    settings.companyName + ' — QUOTATION',
    'Ref: ' + QUOTE_REF,
    'Date: ' + fmtDate(quote.date),
    'Valid until: ' + fmtDate(q.validUntil),
    quote.customer ? 'Prepared for: ' + quote.customer : null,
    '',
    'ITEM',
    '  ' + q.bag.name + ' (' + q.bag.category + ')',
    '  Reference: ' + q.bag.ref,
    '  Specification: ' + q.dims + ' · ' + q.bag.gsm + ' GSM',
    '  Order quantity: ' + intFmt(q.qty) + ' bags',
    '',
    'PRICING',
    '  Rate for ' + intFmt(q.qty) + ' bags: ' + lkr(q.unitBeforeAddon) + ' / bag',
    q.addonCost > 0 ? '  Printing / add-on: ' + lkr(q.addonCost) + ' / bag' : null,
    '',
    '  UNIT PRICE: ' + lkr(q.unitPrice) + ' / bag',
    '  TOTAL ORDER VALUE: ' + lkr(q.total),
    '  Price per 1,000 bags: ' + lkr(q.per1000),
    '',
    'TERMS',
    '  Production lead time: ' + (quote.leadTime || '-'),
    '  Validity: ' + quote.validityDays + ' day(s)',
    quote.notes ? '  Notes: ' + quote.notes : null,
    '',
    'All prices are in Sri Lankan Rupees (LKR).',
  ].filter((line): line is string => line !== null);
  return lines.join('\n');
}
