/* Rate card: normalise + load (administrator controlled).
   Both pages need the cost and markup numbers, but the calculator never displays them.
   They arrive in this order:
     1. the factory defaults in factory.ts,
     2. the copy the administrator saved in this browser (localStorage),
     3. the shared catalog.json behind serve.js - the newest timestamp wins. */
import { FACTORY_BAGS, FACTORY_SETTINGS, FACTORY_TIERS } from './factory.ts';
import type { Bag, FactorySettings } from './factory.ts';
import { intFmt } from './format.ts';
import type { RateCard, RateDoc, RateSource, TierRow } from './types.ts';

export const RATES_KEY = 'mhs-rates-v1';      // shared with the admin page
export const RATES_ENDPOINT = '/api/rates';   // served by serve.js (optional)

export function normaliseTiers(raw: unknown): TierRow[] {
  const source = Array.isArray(raw) && raw.length ? raw : FACTORY_TIERS;
  const clean: { min: number; max: number; markup: number }[] = [];
  source.forEach((t: any) => {
    if (!t) return;
    const min = Math.max(1, Math.floor(Number(t.min)) || 1);
    const rawMax = Number(t.max);
    clean.push({
      min,
      max: Number.isFinite(rawMax) && rawMax >= min ? Math.floor(rawMax) : Infinity,
      markup: Math.max(0, Number(t.markup) || 0),
    });
  });
  clean.sort((a, b) => a.min - b.min);
  if (!clean.length) return normaliseTiers(FACTORY_TIERS);

  return clean.map((tier) => ({
    min: tier.min,
    max: tier.max,
    markup: tier.markup,
    range: intFmt(tier.min) + (tier.max === Infinity ? ' +' : ' – ' + intFmt(tier.max)),
    short: intFmt(tier.min) + (tier.max === Infinity ? '+' : '–' + intFmt(tier.max)),
  }));
}

export function normaliseBags(raw: unknown): Bag[] {
  const source = Array.isArray(raw) && raw.length ? raw : FACTORY_BAGS;
  const clean: Bag[] = [];
  source.forEach((b: any, index: number) => {
    if (!b || typeof b !== 'object') return;
    const cost = Number(b.cost);
    if (!Number.isFinite(cost) || cost <= 0) return;
    const override = Number(b.markup);
    const hasOverride = b.markup != null && b.markup !== '' && Number.isFinite(override) && override >= 0;
    clean.push({
      id: String(b.id || 'bag_' + index),
      category: String(b.category || 'Bag'),
      name: String(b.name || 'Unnamed bag'),
      ref: String(b.ref == null ? '' : b.ref),
      gsm: String(b.gsm == null ? '' : b.gsm),
      width: Number(b.width) || 0,
      height: Number(b.height) || 0,
      gusset: Number(b.gusset) || 0,
      minQty: Math.max(1, Math.floor(Number(b.minQty)) || 1),
      cost,
      markup: hasOverride ? override : null,
      active: b.active !== false,
    });
  });
  return clean.length ? clean : FACTORY_BAGS.map((b) => Object.assign({}, b));
}

export function normaliseSettings(raw: unknown): FactorySettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const validity = Math.floor(Number(s.defaultValidityDays));
  return {
    minOrderQty: Math.max(1, Math.floor(Number(s.minOrderQty)) || FACTORY_SETTINGS.minOrderQty),
    allowManualMarkup: s.allowManualMarkup === true,
    defaultValidityDays: Number.isFinite(validity) ? Math.min(365, Math.max(1, validity)) : FACTORY_SETTINGS.defaultValidityDays,
    defaultLeadTime: typeof s.defaultLeadTime === 'string' && s.defaultLeadTime.trim() ? s.defaultLeadTime : FACTORY_SETTINGS.defaultLeadTime,
    companyName: typeof s.companyName === 'string' && s.companyName.trim() ? s.companyName : FACTORY_SETTINGS.companyName,
    companyTagline: typeof s.companyTagline === 'string' && s.companyTagline.trim() ? s.companyTagline : FACTORY_SETTINGS.companyTagline,
    defaultNotes: typeof s.defaultNotes === 'string' ? s.defaultNotes : '',
  };
}

/** The factory card, i.e. "no administrator changes at all". */
export function factoryCard(): RateCard {
  return {
    bags: normaliseBags(FACTORY_BAGS),
    tiers: normaliseTiers(FACTORY_TIERS),
    settings: normaliseSettings(FACTORY_SETTINGS),
    info: { source: 'factory', updatedAt: null },
  };
}

/** Build a card from a stored/published document. Returns null when the document is unusable. */
export function buildRateCard(doc: RateDoc | null | undefined, source: RateSource): RateCard | null {
  const external = !!doc && typeof doc === 'object';
  const input = (external ? doc : { tiers: FACTORY_TIERS, bags: FACTORY_BAGS, settings: FACTORY_SETTINGS }) as RateDoc;
  const bags = normaliseBags(input.bags);
  const tiers = normaliseTiers(input.tiers);
  if (!bags.length || !tiers.length) return null;
  return {
    bags,
    tiers,
    settings: normaliseSettings(input.settings),
    info: {
      source: external ? source : 'factory',
      updatedAt: external && typeof input.updatedAt === 'string' ? input.updatedAt : null,
    },
  };
}

export function readLocalRateCard(): RateDoc | null {
  try {
    const txt = localStorage.getItem(RATES_KEY);
    return txt ? JSON.parse(txt) : null;
  } catch {
    return null;
  }
}

export function rateStamp(doc: RateDoc | null | undefined): number {
  const t = doc && doc.updatedAt ? Date.parse(String(doc.updatedAt)) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** Optional: pick up the rate card shared through serve.js when it is newer than ours. */
export async function loadSharedRateCard(local: RateDoc | null): Promise<RateDoc | null> {
  if (!/^https?:$/.test(location.protocol)) return null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const options: RequestInit = { cache: 'no-store' };
    if (typeof AbortController === 'function') {
      const controller = new AbortController();
      options.signal = controller.signal;
      timer = setTimeout(() => controller.abort(), 2500);
    }
    const res = await fetch(RATES_ENDPOINT, options);
    const payload = await res.json();
    const remote: RateDoc | null = payload && payload.ok && payload.data ? payload.data : null;
    if (remote && rateStamp(remote) >= rateStamp(local)) return remote;
  } catch {
    /* no server, offline, or a static host without the API - keep what we have */
  } finally {
    if (timer) clearTimeout(timer);
  }
  return null;
}