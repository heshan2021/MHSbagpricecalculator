/* Pricing engine - one pure calculation, identical to the legacy pages.
     unit price  = base cost x (1 + markup) + printing / addon
     order total = unit price x quantity                                        */
import { FACTORY_BAGS } from './factory.ts';
import type { Bag } from './factory.ts';
import { addDaysISO } from './dates.ts';
import type { RateCard, TierRow } from './types.ts';

export interface QuoteDetails {
  customer: string;
  date: string;
  validityDays: number | string;
  leadTime: string;
  notes: string;
}

export interface QuoteState {
  bagId: string;
  /** kept exactly as typed (string or number), normalised only for the maths */
  qty: string | number;
  addonCost: string | number;
  markupMode: 'tier' | 'manual';
  manualMarkup: number;
  quote: QuoteDetails;
}

export interface QuoteResult {
  bag: Bag;
  qty: number;
  baseCost: number;
  addonCost: number;
  tier: TierRow;
  markup: number;
  manual: boolean;
  unitBeforeAddon: number;
  unitPrice: number;
  total: number;
  per1000: number;
  savingPerBag: number;
  savingPct: number;
  savingTotal: number;
  dims: string;
  validUntil: string;
}

export function normalizeQty(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function tierFor(tiers: TierRow[], qty: unknown): TierRow {
  const q = normalizeQty(qty);
  return tiers.find((t) => q >= t.min && q <= t.max)
    || (q < tiers[0].min ? tiers[0] : tiers[tiers.length - 1]);
}

export function bagById(card: RateCard, id: string): Bag {
  return card.bags.find((b) => b.id === id)
    || card.bags.filter((b) => b.active)[0]
    || card.bags[0];
}

export function bagDims(bag: Bag): string {
  return bag.width + ' × ' + bag.height + (bag.gusset ? ' × ' + bag.gusset : '') + ' cm';
}

/** Price of one bag for any catalogue item at any quantity (no add-on). */
export function unitPriceFor(bag: Bag, tiers: TierRow[], qty: unknown): number {
  const tier = tierFor(tiers, qty);
  const markup = bag.markup == null ? tier.markup : bag.markup;
  return Number(bag.cost) * (1 + markup);
}

export function computeQuote(card: RateCard, state: QuoteState): QuoteResult {
  const bag = bagById(card, state.bagId);
  const qty = normalizeQty(state.qty);

  // the cost always comes from the rate card - the customer side can never type it
  const baseCost = Number(bag.cost) > 0 ? Number(bag.cost) : FACTORY_BAGS[0].cost;

  const rawAddon = Number(state.addonCost);
  const addonCost = Number.isFinite(rawAddon) && rawAddon > 0 ? rawAddon : 0;

  const tier = tierFor(card.tiers, qty);
  const manual = card.settings.allowManualMarkup && state.markupMode === 'manual';
  // a per-bag override in the rate card beats the quantity tier
  const markup = manual
    ? Math.max(0, Number(state.manualMarkup) || 0)
    : (bag.markup == null ? tier.markup : bag.markup);

  const unitBeforeAddon = baseCost * (1 + markup);
  const unitPrice = unitBeforeAddon + addonCost;
  const total = unitPrice * qty;

  const topMarkup = card.tiers.length ? card.tiers[0].markup : markup;
  const referenceUnit = baseCost * (1 + topMarkup) + addonCost;
  const savingPerBag = Math.max(0, referenceUnit - unitPrice);
  const savingPct = referenceUnit > 0 ? savingPerBag / referenceUnit : 0;

  return {
    bag, qty, baseCost, addonCost, tier, markup, manual,
    unitBeforeAddon, unitPrice, total,
    per1000: unitPrice * 1000,
    savingPerBag, savingPct, savingTotal: savingPerBag * qty,
    dims: bagDims(bag),
    validUntil: addDaysISO(state.quote.date, state.quote.validityDays),
  };
}
