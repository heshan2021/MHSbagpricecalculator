import type { Bag, FactorySettings } from './factory.ts';

/** A pricing tier as the pages actually use it: the stored numbers plus the two labels. */
export interface TierRow {
  min: number;
  max: number;
  markup: number;
  /** '100 – 499' / '10,000 +' */
  range: string;
  /** '100–499' / '10,000+' */
  short: string;
}

export type RateSource = 'factory' | 'browser' | 'server';

export interface RateInfo {
  source: RateSource;
  updatedAt: string | null;
}

/** Everything the administrator can publish, in the shape both pages consume. */
export interface RateCard {
  bags: Bag[];
  tiers: TierRow[];
  settings: FactorySettings;
  info: RateInfo;
}

/** The raw document as stored in localStorage / catalog.json / the API. */
export interface RateDoc {
  tiers?: unknown;
  bags?: unknown;
  settings?: unknown;
  updatedAt?: unknown;
  version?: unknown;
}
