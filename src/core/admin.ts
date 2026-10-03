/* Administrator rate control - the logic behind the /admin page, ported 1:1 from the legacy
   single-file panel (legacy/admin.html). The markup lives in src/pages/Admin.tsx and the state
   lives in src/pages/admin/useAdminPanel.ts; everything here is a pure function, so the rate
   arithmetic, the validation wording and the activity-log diff can be compared with the legacy
   page word for word. */
import { FACTORY_BAGS, FACTORY_SETTINGS, FACTORY_TIERS } from './factory.ts';
import type { Bag, FactorySettings, Tier } from './factory.ts';
import { intFmt, lkr, round2 } from './format.ts';
import { RATES_ENDPOINT, RATES_KEY, rateStamp, readLocalRateCard } from './ratecard.ts';
import type { RateDoc, RateSource } from './types.ts';

export const SCHEMA = 1;
export const SESSION_KEY = 'mhs-admin-session';
export const DEFAULT_HASH = '411289dd';      // fnv1a('mhs-bags' + ':' + 'mhs-admin')
export const SALT = 'mhs-bags';
export const IDLE_LOCK_MS = 15 * 60 * 1000;
export const MAX_LOG = 40;

export const CATEGORIES = ['Box Bag', 'D Cut Bag', 'W Cut Bag'];

export { RATES_KEY };

export interface AdminLogEntry {
  at: string;
  action: string;
  detail: string;
}

/** The document both pages agree on - the exact shape written to catalog.json and localStorage. */
export interface AdminDoc {
  schema: number;
  updatedAt: string | null;
  tiers: Tier[];
  bags: Bag[];
  settings: FactorySettings;
  security: { salt: string; adminHash: string };
  log: AdminLogEntry[];
}

/** One problem the panel found in the draft; `level: 'warn'` still allows saving. */
export interface Issue {
  scope: 'tiers' | 'bags' | 'settings';
  index?: number;
  field?: string;
  level?: 'warn';
  message: string;
}

export function numv(value: unknown, fallback?: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : (fallback == null ? 0 : fallback);
}

export function pctText(fraction: unknown, decimals?: number): string {
  const n = Number(fraction) || 0;
  const out = (n * 100).toFixed(decimals == null ? 2 : decimals);
  return out.replace(/(\.\d*[1-9])0+$/, '$1').replace(/\.0+$/, '') + '%';
}

export function fmtDateTime(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/* password hashing (FNV-1a) - keeps the password itself out of the rate card file */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}
export function hashPassword(password: string): string {
  return fnv1a(SALT + ':' + password);
}

/* ---------- rate card: normalise + load ---------- */
export function normaliseTiers(raw: unknown): Tier[] {
  const list = Array.isArray(raw) ? raw : [];
  const clean: { min: number; maxRaw: number | null; markup: number }[] = [];
  list.forEach((t: any) => {
    if (!t) return;
    const min = Math.max(1, Math.floor(numv(t.min, 0)) || 1);
    const maxRaw = t.max == null || t.max === '' ? null : Math.floor(numv(t.max, 0));
    clean.push({ min, maxRaw, markup: Math.max(0, numv(t.markup, 0)) });
  });
  clean.sort((a, b) => a.min - b.min);
  if (!clean.length) return deepClone(FACTORY_TIERS);
  return clean.map((t, i, all) => {
    const last = i === all.length - 1;
    let max = t.maxRaw;
    if (last) max = null;                                  // the top band always runs to "and above"
    else if (max == null || max < t.min) max = Math.max(t.min, all[i + 1].min - 1);
    return { min: t.min, max, markup: t.markup };
  });
}

export function normaliseBags(raw: unknown): Bag[] {
  const list = Array.isArray(raw) && raw.length ? raw : FACTORY_BAGS;
  const seen: Record<string, boolean> = {};
  return list.map((b: any, index: number) => {
    const bag: Bag = {
      id: String(b && b.id ? b.id : 'bag_' + (index + 1)),
      category: String(b && b.category ? b.category : 'Box Bag'),
      name: String(b && b.name ? b.name : ''),
      ref: String(b && b.ref != null ? b.ref : ''),
      gsm: String(b && b.gsm != null ? b.gsm : ''),
      width: numv(b && b.width, 0),
      height: numv(b && b.height, 0),
      gusset: numv(b && b.gusset, 0),
      minQty: Math.floor(numv(b && b.minQty, 500)),
      cost: numv(b && b.cost, 0),
      markup: (b && b.markup != null && b.markup !== '' && Number.isFinite(Number(b.markup)))
        ? Math.max(0, Number(b.markup)) : null,
      active: !b || b.active !== false,
    };
    if (seen[bag.id]) bag.id = bag.id + '_' + (index + 1);
    seen[bag.id] = true;
    return bag;
  });
}

export function normaliseSettings(raw: unknown): FactorySettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const validity = Math.floor(numv(s.defaultValidityDays, FACTORY_SETTINGS.defaultValidityDays));
  return {
    minOrderQty: Math.max(1, Math.floor(numv(s.minOrderQty, FACTORY_SETTINGS.minOrderQty))),
    allowManualMarkup: s.allowManualMarkup === true,
    defaultValidityDays: Math.min(365, Math.max(1, validity)),
    defaultLeadTime: (typeof s.defaultLeadTime === 'string' && s.defaultLeadTime.trim()) ? s.defaultLeadTime : FACTORY_SETTINGS.defaultLeadTime,
    companyName: (typeof s.companyName === 'string' && s.companyName.trim()) ? s.companyName : FACTORY_SETTINGS.companyName,
    companyTagline: (typeof s.companyTagline === 'string' && s.companyTagline.trim()) ? s.companyTagline : FACTORY_SETTINGS.companyTagline,
    defaultNotes: typeof s.defaultNotes === 'string' ? s.defaultNotes : '',
  };
}

/** The document that both pages agree on. */
export function normaliseDoc(raw: unknown): AdminDoc {
  const doc = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const security = doc.security && typeof doc.security === 'object' ? doc.security : {};
  const hash = typeof security.adminHash === 'string' && /^[0-9a-f]{8}$/i.test(security.adminHash)
    ? security.adminHash.toLowerCase()
    : DEFAULT_HASH;
  return {
    schema: SCHEMA,
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
    tiers: normaliseTiers(doc.tiers),
    bags: normaliseBags(doc.bags),
    settings: normaliseSettings(doc.settings),
    security: { salt: SALT, adminHash: hash },
    log: Array.isArray(doc.log) ? doc.log.slice(-MAX_LOG) : [],
  };
}

/** The fallback copy: "no administrator changes at all". */
export const FACTORY: AdminDoc = {
  schema: SCHEMA,
  updatedAt: null,
  tiers: FACTORY_TIERS,
  bags: FACTORY_BAGS,
  settings: FACTORY_SETTINGS,
  security: { salt: SALT, adminHash: DEFAULT_HASH },
  log: [],
};

export function factoryDoc(): AdminDoc {
  return normaliseDoc(deepClone(FACTORY));
}

export function stampOf(doc: unknown): number {
  return rateStamp(doc as RateDoc | null);
}

/* The panel edits the same copy the calculator shows, so it loads it the same way:
   newest of (local server copy, this browser's copy) with the factory card as the base. */
export async function loadRateCard(): Promise<{ rates: AdminDoc; source: RateSource }> {
  const local = readLocalRateCard();
  let best: unknown = local;
  let bestSource: RateSource = local ? 'browser' : 'factory';

  if (/^https?:$/.test(location.protocol)) {
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
      const remote = payload && payload.ok && payload.data ? payload.data : null;
      if (remote && stampOf(remote) >= stampOf(best)) {
        best = remote;
        bestSource = 'server';
      }
    } catch {
      /* no server running - the browser copy (or the factory card) is what we have */
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return { rates: normaliseDoc(best || FACTORY), source: bestSource };
}
/* ---------- sign in / sign out ---------- */
export function hashFromSession(): string | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.hash === 'string' ? parsed.hash : null;
  } catch {
    return null;
  }
}

export function rememberSession(hash: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ hash, at: Date.now() }));
  } catch { /* private mode */ }
}

export function forgetSession(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

/* ---------- pricing helpers (mirror of the calculator) ---------- */
export function bands(tiers: Tier[]): Tier[] {
  return tiers && tiers.length ? tiers : FACTORY_TIERS;
}

export function tierForQty(tiers: Tier[], qty: unknown): Tier {
  const list = bands(tiers);
  const q = Math.max(1, Math.floor(numv(qty, 1)));
  return list.find((t) => q >= t.min && (t.max == null || q <= t.max))
    || (q < list[0].min ? list[0] : list[list.length - 1]);
}

export function markupFor(bag: Bag, qty: unknown, tiers: Tier[]): number {
  if (bag.markup != null) return bag.markup;
  const tier = tierForQty(tiers, qty);
  return tier ? tier.markup : 0;
}

export function priceFor(bag: Bag, qty: unknown, tiers: Tier[]): number {
  return numv(bag.cost, 0) * (1 + markupFor(bag, qty, tiers));
}

export function bandShort(tier: Tier): string {
  return intFmt(tier.min) + (tier.max == null ? '+' : '–' + intFmt(tier.max));
}

export function midBand(tiers: Tier[]): Tier {
  const l = bands(tiers);
  return l[Math.min(1, l.length - 1)];
}

export function lowBand(tiers: Tier[]): Tier {
  const l = bands(tiers);
  return l[l.length - 1];
}

export function pctInputValue(fraction: unknown): string {
  return String(round2((Number(fraction) || 0) * 100));
}
/* ---------- validation ---------- */
export function validateDraft(draft: AdminDoc): Issue[] {
  const found: Issue[] = [];
  const tiers = draft.tiers;

  if (!tiers.length) found.push({ scope: 'tiers', message: 'At least one markup band is required.' });
  tiers.forEach((t, i) => {
    const label = 'Band ' + (i + 1);
    if (!(t.min >= 1)) found.push({ scope: 'tiers', index: i, field: 'min', message: label + ': “From qty” must be 1 or more.' });
    if (!(t.markup >= 0)) found.push({ scope: 'tiers', index: i, field: 'markup', message: label + ': the markup cannot be negative.' });
    else if (t.markup > 5) found.push({ scope: 'tiers', index: i, field: 'markup', message: label + ': a markup above 500% looks wrong - please check it.' });
    const prev = tiers[i - 1];
    if (prev) {
      if (t.min <= prev.min) {
        found.push({ scope: 'tiers', index: i, field: 'min', message: label + ' must start above band ' + i + '.' });
      } else if (prev.max != null && t.min <= prev.max) {
        found.push({ scope: 'tiers', index: i, field: 'min', message: label + ' overlaps band ' + i + ' - start it above ' + intFmt(prev.max) + '.' });
      } else if (prev.max != null && t.min > prev.max + 1) {
        found.push({ scope: 'tiers', index: i, field: 'min', level: 'warn', message: label + ' leaves ' + intFmt(t.min - prev.max - 1) + ' bag(s) uncovered; those quantities use the nearest band.' });
      }
    }
    if (i < tiers.length - 1 && t.max == null) {
      found.push({ scope: 'tiers', index: i, field: 'max', level: 'warn', message: label + ' has no end, so it covers the later bands too.' });
    }
  });

  const ids: Record<string, boolean> = {};
  draft.bags.forEach((b, i) => {
    const label = String(b.name || '').trim() || ('Row ' + (i + 1));
    if (!String(b.name || '').trim()) found.push({ scope: 'bags', index: i, field: 'name', message: 'Row ' + (i + 1) + ': the model needs a name.' });
    if (!String(b.ref || '').trim()) found.push({ scope: 'bags', index: i, field: 'ref', level: 'warn', message: label + ': no reference or use case yet.' });
    if (!(b.cost > 0)) found.push({ scope: 'bags', index: i, field: 'cost', message: label + ': the base cost must be greater than 0.' });
    else if (b.cost > 100000) found.push({ scope: 'bags', index: i, field: 'cost', level: 'warn', message: label + ': such a high cost per bag is unusual - please double-check it.' });
    if (!(b.minQty >= 1)) found.push({ scope: 'bags', index: i, field: 'minQty', message: label + ': the minimum order must be at least 1 bag.' });
    if (!(b.width > 0) || !(b.height > 0)) found.push({ scope: 'bags', index: i, field: 'width', level: 'warn', message: label + ': fill in width and height so the 3D preview keeps its proportions.' });
    if (b.markup != null && b.markup > 5) found.push({ scope: 'bags', index: i, field: 'markup', message: label + ': an override above 500% looks wrong - please check it.' });
    if (ids[b.id]) found.push({ scope: 'bags', index: i, field: 'name', message: label + ': duplicate model id (the calculator would confuse the two).' });
    ids[b.id] = true;
  });

  if (!draft.bags.some((b) => b.active)) found.push({ scope: 'bags', message: 'At least one model has to stay in use, otherwise the calculator has nothing to quote.' });
  if (!(draft.settings.minOrderQty >= 1)) found.push({ scope: 'settings', field: 'minOrderQty', message: 'The catalogue minimum order must be at least 1 bag.' });
  if (!String(draft.settings.companyName || '').trim()) found.push({ scope: 'settings', field: 'companyName', message: 'The company name appears on every quotation - please fill it in.' });

  return found;
}
/* what changed between two documents - recorded in the activity log */
export function diffSummary(prev: AdminDoc, next: AdminDoc): string {
  const parts: string[] = [];

  const sameTiers = prev.tiers.length === next.tiers.length && prev.tiers.every((t, i) =>
    t.min === next.tiers[i].min && t.max === next.tiers[i].max && Math.abs(t.markup - next.tiers[i].markup) < 1e-9);
  if (!sameTiers) parts.push('markup bands changed (' + prev.tiers.length + ' to ' + next.tiers.length + ')');

  const byId: Record<string, Bag> = {};
  prev.bags.forEach((b) => { byId[b.id] = b; });
  const seen: Record<string, boolean> = {};
  let added = 0;
  let changed = 0;
  next.bags.forEach((b) => {
    seen[b.id] = true;
    const old = byId[b.id];
    if (!old) { added += 1; return; }
    const fields = ['name', 'category', 'ref', 'gsm', 'width', 'height', 'gusset', 'minQty', 'cost', 'markup', 'active']
      .filter((f) => String((old as any)[f]) !== String((b as any)[f]));
    if (fields.length) changed += 1;
  });
  const removed = prev.bags.filter((b) => !seen[b.id]).length;
  if (added) parts.push(added + ' model(s) added');
  if (removed) parts.push(removed + ' model(s) removed');
  if (changed) parts.push(changed + ' model(s) edited');

  const keys: (keyof FactorySettings)[] = ['minOrderQty', 'allowManualMarkup', 'defaultValidityDays', 'defaultLeadTime', 'companyName', 'companyTagline', 'defaultNotes'];
  const settingsChanged = keys.filter((k) => String(prev.settings[k]) !== String(next.settings[k]));
  if (settingsChanged.length) parts.push('settings changed (' + settingsChanged.join(', ') + ')');
  if (prev.security.adminHash !== next.security.adminHash) parts.push('administrator password changed');

  return parts.length ? parts.join('; ') : 'saved without changing any value';
}

/** PUT /api/rates - the password in the header authorises the write (checked by serve.js). */
export async function publishRateDoc(doc: AdminDoc, authHash: string | null): Promise<void> {
  const res = await fetch(RATES_ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-mhs-admin': authHash || DEFAULT_HASH },
    body: JSON.stringify(doc),
  });
  let payload: any = null;
  try { payload = await res.json(); } catch { payload = null; }
  if (!res.ok || !payload || payload.ok !== true) {
    const why = (payload && payload.error) || ('the server answered HTTP ' + res.status);
    throw new Error(why);
  }
}




