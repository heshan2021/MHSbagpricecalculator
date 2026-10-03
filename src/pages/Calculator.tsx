/* MHS Bag Price Calculator - customer page.
   The markup below is the legacy shell converted 1:1 to JSX; every region the legacy script
   wrote into with innerHTML/textContent is now derived from React state, so the rendered DOM
   stays the same while the pricing logic lives in src/core. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FACTORY_BAGS, FACTORY_SETTINGS } from '../core/factory.ts';
import { fmtDate, todayISO } from '../core/dates.ts';
import { intFmt, lkr, pct } from '../core/format.ts';
import { buildRateCard, factoryCard, loadSharedRateCard, readLocalRateCard } from '../core/ratecard.ts';
import { bagDims, computeQuote, normalizeQty, unitPriceFor } from '../core/pricing.ts';
import type { QuoteState } from '../core/pricing.ts';
import { buildQuoteText, QUOTE_REF } from '../core/quoteText.ts';
import type { RateCard } from '../core/types.ts';
import { BagPreview } from '../components/calculator/BagPreview.tsx';

const STORAGE_KEY = 'mhs-bag-quote-v2';
const DEFAULT_LEAD_TIME = FACTORY_SETTINGS.defaultLeadTime;

const CATEGORY_TABS = [
  { key: 'all', countId: 'count-all' },
  { key: 'Box Bag', countId: 'count-box' },
  { key: 'D Cut Bag', countId: 'count-dcut' },
  { key: 'W Cut Bag', countId: 'count-wcut' },
] as const;

type ToastKind = 'success' | 'info' | 'warn';
const TOAST_ICONS: Record<ToastKind, string> = {
  success: 'fa-solid fa-circle-check',
  info: 'fa-solid fa-circle-info',
  warn: 'fa-solid fa-triangle-exclamation',
};
/* The legacy script wrote these two fields straight into the DOM, so what the user typed stays
   on screen until the next sync (boot or reset) - not on every re-render. */
function formatAddon(value: unknown): string {
  if (value === '' || value == null || !Number.isFinite(Number(value))) return '';
  return Number(value).toFixed(2);
}
function formatMarkupPercent(fraction: number): string {
  return String(Math.round((Number(fraction) || 0) * 10000) / 100);
}
const NOTE_ICONS: Record<string, string> = {
  warn: 'fa-solid fa-triangle-exclamation',
  info: 'fa-solid fa-circle-info',
  ok: 'fa-solid fa-circle-check',
};

/* ---------- state -> inputs (legacy applyState) ---------- */
function applyStoredState(state: QuoteState, data: any, card: RateCard): QuoteState {
  const next: QuoteState = { ...state };
  const bag = card.bags.find((b) => b.id === data.bagId);
  if (bag) next.bagId = bag.id;

  if (data.qty != null && data.qty !== '') next.qty = normalizeQty(data.qty);

  // the cost is never read from a link or from storage - it always follows the rate card
  const addon = Number(data.addonCost);
  next.addonCost = Number.isFinite(addon) && addon > 0 ? addon : 0;

  // markup mode and the manual percentage are ignored unless the administrator allows them
  next.markupMode = card.settings.allowManualMarkup && data.markupMode === 'manual' ? 'manual' : 'tier';

  const markup = Number(data.manualMarkup);
  next.manualMarkup = Number.isFinite(markup) && markup >= 0 ? markup : 0.30;

  const q = data.quote || {};
  next.quote = {
    customer: typeof q.customer === 'string' ? q.customer : '',
    date: /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : todayISO(),
    validityDays: Math.min(365, Math.max(1, Number(q.validityDays) || card.settings.defaultValidityDays)),
    leadTime: typeof q.leadTime === 'string' && q.leadTime ? q.leadTime : card.settings.defaultLeadTime,
    notes: typeof q.notes === 'string' ? q.notes : '',
  };
  return next;
}

/* A deep link wins, otherwise the quotation saved in this browser. */
function readRestorable(): any | null {
  try {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (params.get('bag')) {
      return {
        bagId: params.get('bag'),
        qty: params.get('qty'),
        baseCost: params.get('base'),
        addonCost: params.get('addon'),
        markupMode: params.get('mode'),
        manualMarkup: params.get('m'),
        quote: {
          customer: params.get('c') || '',
          date: params.get('d') || todayISO(),
          validityDays: params.get('v') || 14,
          leadTime: params.get('lt') || DEFAULT_LEAD_TIME,
          notes: params.get('n') || '',
        },
      };
    }
  } catch {
    /* ignore malformed hashes */
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* ignore unreadable storage */
  }
  return null;
}

/* Keeps the live quotation compatible with a (new) rate card, the way applyRateCard did:
   never leave the calculator pointing at a model the administrator retired. */
function reconcileToCard(state: QuoteState, card: RateCard): QuoteState {
  let next = state;
  if (!card.bags.some((b) => b.id === state.bagId && b.active)) {
    const first = card.bags.filter((b) => b.active)[0] || card.bags[0];
    next = { ...next, bagId: first.id };
  }
  if (!card.settings.allowManualMarkup) {
    next = { ...next, markupMode: 'tier', manualMarkup: 0.30 };
  }
  return next;
}

/* Boot order copied from boot(): the browser rate card first (so the first paint already shows
   the real prices), then the deep link / saved quotation, then the administrator's defaults. */
function bootState(): { card: RateCard; state: QuoteState; restored: boolean } {
  let card = factoryCard();
  const local = readLocalRateCard();
  if (local) {
    const built = buildRateCard(local, 'browser');
    if (built) card = built;
  }

  const firstActive = card.bags.filter((b) => b.active)[0] || card.bags[0] || FACTORY_BAGS[0];
  const startBagId = card.bags.some((b) => b.id === FACTORY_BAGS[0].id && b.active) ? FACTORY_BAGS[0].id : firstActive.id;

  let state: QuoteState = {
    bagId: startBagId,
    qty: 500,
    addonCost: 0,
    markupMode: 'tier',
    manualMarkup: 0.30,
    quote: {
      customer: '',
      date: todayISO(),
      validityDays: FACTORY_SETTINGS.defaultValidityDays,
      leadTime: FACTORY_SETTINGS.defaultLeadTime,
      notes: '',
    },
  };

  const data = readRestorable();
  const restored = !!data;
  if (data) {
    state = applyStoredState(state, data, card);
  } else {
    /* a brand new visitor gets the administrator's quotation defaults */
    state = {
      ...state,
      quote: {
        ...state.quote,
        date: todayISO(),
        validityDays: card.settings.defaultValidityDays,
        leadTime: card.settings.defaultLeadTime,
        notes: card.settings.defaultNotes,
      },
    };
  }

  return { card, state, restored };
}


export function Calculator() {
  const boot = useMemo(bootState, []);
  const [card, setCard] = useState<RateCard>(boot.card);
  const [state, setState] = useState<QuoteState>(boot.state);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [modal, setModal] = useState({ query: '', cat: 'all', sort: 'default' });
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: ToastKind; message: string; open: boolean }>({
    kind: 'success',
    message: '',
    open: false,
  });

  /* what the two "type it yourself" fields show, exactly like the legacy el.value handling */
  const [addonText, setAddonText] = useState(() => formatAddon(boot.state.addonCost));
  const [manualText, setManualText] = useState(() => formatMarkupPercent(boot.state.manualMarkup));

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalOpener = useRef<HTMLElement | null>(null);
  const restoredRef = useRef(boot.restored);

  /* ---------- derived values (one pass, like renderAll) ---------- */
  const q = useMemo(() => computeQuote(card, state), [card, state]);

  const liveItems = useMemo(() => card.bags.filter((b) => b.active), [card]);
  const items = useMemo(
    () => (activeCategory === 'all' ? liveItems : liveItems.filter((b) => b.category === activeCategory)),
    [liveItems, activeCategory],
  );

  const warnings = useMemo(() => {
    const list: [string, string][] = [];
    if (q.qty < card.settings.minOrderQty) {
      list.push(['warn', 'The catalogue minimum order is ' + intFmt(card.settings.minOrderQty)
        + ' bags. The price above uses the ' + card.tiers[0].range + ' rate.']);
    } else if (q.qty < q.bag.minQty) {
      list.push(['warn', q.bag.name + ' has a recommended minimum of ' + intFmt(q.bag.minQty)
        + ' bags — this quantity may not be accepted.']);
    } else {
      list.push(['ok', intFmt(q.qty) + ' bags meets the catalogue minimum for ' + q.bag.name + '.']);
    }
    if (q.tier === card.tiers[card.tiers.length - 1]) {
      list.push(['ok', 'Best rate reached — this is the lowest price per bag on the rate card.']);
    }
    if (q.bag.markup != null && !q.manual) {
      list.push(['info', 'The quantity rate agreed for this model is applied to the whole order.']);
    }
    return list;
  }, [q, card]);

  const modalItems = useMemo(() => {
    let list = liveItems;
    if (modal.cat !== 'all') list = list.filter((b) => b.category === modal.cat);
    const query = modal.query.trim().toLowerCase();
    if (query) {
      list = list.filter((b) => (b.name + ' ' + b.ref + ' ' + b.category + ' ' + b.gsm).toLowerCase().indexOf(query) !== -1);
    }
    const sorted = list.slice();
    if (modal.sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (modal.sort === 'category') sorted.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    else if (modal.sort === 'minorder') sorted.sort((a, b) => a.minQty - b.minQty);
    else if (modal.sort === 'size') sorted.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    return sorted;
  }, [liveItems, modal]);

  /* ---------- toast (legacy showToast) ---------- */
  const showToast = useCallback((message: string, kind: ToastKind = 'success') => {
    setToast({ message, kind, open: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, open: false })), 3400);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  /* ---------- actions ---------- */
  const selectBag = useCallback((id: string, options?: { toast?: boolean }) => {
    const bag = card.bags.find((b) => b.id === id);
    if (!bag) return;
    setState((prev) => {
      const next: QuoteState = { ...prev, bagId: bag.id };
      if (options && options.toast) {
        showToast(bag.name + ' loaded · ' + lkr(computeQuote(card, next).unitPrice)
          + ' / bag at ' + intFmt(normalizeQty(next.qty)) + ' bags.', 'info');
      }
      return next;
    });
    if (activeCategory !== 'all' && bag.category !== activeCategory) setActiveCategory(bag.category);
  }, [card, activeCategory, showToast]);

  const setCategory = useCallback((category: string) => {
    setActiveCategory(category);
    /* the selected model may not be in this filter - fall back to the first match */
    setState((prev) => {
      const list = category === 'all' ? liveItems : liveItems.filter((b) => b.category === category);
      if (!list.some((b) => b.id === prev.bagId) && list.length) return { ...prev, bagId: list[0].id };
      return prev;
    });
  }, [liveItems]);

  const setQty = useCallback((value: unknown) => {
    setState((prev) => ({ ...prev, qty: normalizeQty(value) }));
  }, []);

  const stepQty = useCallback((direction: number) => {
    setState((prev) => {
      const qty = normalizeQty(prev.qty);
      const step = qty < 500 ? 10 : (qty < 5000 ? 100 : 1000);
      return { ...prev, qty: normalizeQty(qty + direction * step) };
    });
  }, []);

  const setMarkupMode = useCallback((mode: 'tier' | 'manual') => {
    /* guarded: the manual markup control is only offered when the administrator enables it */
    if (!card.settings.allowManualMarkup) {
      setState((prev) => ({ ...prev, markupMode: 'tier' }));
      return;
    }
    setState((prev) => ({ ...prev, markupMode: mode === 'manual' ? 'manual' : 'tier' }));
  }, [card]);

  const resetQuote = useCallback(() => {
    const bag = card.bags.filter((b) => b.active)[0] || card.bags[0];
    setActiveCategory('all');
    setState({
      bagId: bag.id,
      qty: 500,
      addonCost: 0,
      markupMode: 'tier',            // a fresh quotation always uses the rate card
      manualMarkup: 0.30,
      quote: {
        customer: '',
        date: todayISO(),
        validityDays: card.settings.defaultValidityDays,
        leadTime: card.settings.defaultLeadTime,
        notes: card.settings.defaultNotes,
      },
    });
    setAddonText(formatAddon(0));
    setManualText(formatMarkupPercent(0.30));
    showToast('Calculator reset to catalogue defaults.', 'info');
  }, [card, showToast]);

  /* ---------- export actions ---------- */
  function legacyCopy(text: string) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    if (!ok) throw new Error('execCommand copy failed');
  }

  const copyQuotation = useCallback(async () => {
    const text = buildQuoteText(card.settings, state.quote, computeQuote(card, state));
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        legacyCopy(text);
      }
      showToast('Quotation copied to the clipboard.', 'success');
    } catch {
      try {
        legacyCopy(text);
        showToast('Quotation copied to the clipboard.', 'success');
      } catch {
        showToast('Copy was blocked by the browser — select the quotation text manually.', 'warn');
      }
    }
  }, [card, state, showToast]);

  const printQuotation = useCallback(() => {
    showToast('Opening the print dialog — choose “Save as PDF” to export.', 'info');
    setTimeout(() => window.print(), 250);
  }, [showToast]);

  /* ---------- persistence: URL hash + localStorage (legacy persistState) ---------- */
  useEffect(() => {
    const timer = setTimeout(() => {
      const addon = (state.addonCost === '' || state.addonCost == null) ? '' : String(state.addonCost);
      try {
        const params = new URLSearchParams();
        params.set('bag', state.bagId);
        params.set('qty', String(normalizeQty(state.qty)));
        params.set('addon', addon);
        params.set('d', state.quote.date);
        params.set('v', String(state.quote.validityDays));
        params.set('lt', state.quote.leadTime);
        /* cost and markup only travel in the link when the administrator allows overrides,
           otherwise a visitor could probe the price to reverse-engineer the cost */
        if (card.settings.allowManualMarkup) {
          params.set('base', String(q.baseCost));
          params.set('mode', state.markupMode);
          params.set('m', String(state.manualMarkup));
        }
        if (state.quote.customer) params.set('c', state.quote.customer);
        if (state.quote.notes) params.set('n', state.quote.notes);
        history.replaceState(null, '', '#' + params.toString());
      } catch {
        /* deep links are optional */
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          bagId: state.bagId,
          qty: state.qty,
          addonCost: state.addonCost,
          markupMode: card.settings.allowManualMarkup ? state.markupMode : 'tier',
          manualMarkup: card.settings.allowManualMarkup ? state.manualMarkup : 0.30,
          quote: state.quote,
        }));
      } catch {
        /* private mode or restricted file:// storage */
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [state, card, q]);

  /* ---------- an optional newer rate card shared through serve.js ---------- */
  useEffect(() => {
    let cancelled = false;
    loadSharedRateCard(readLocalRateCard()).then((remote) => {
      if (cancelled || !remote) return;
      const built = buildRateCard(remote, 'server');
      if (!built) return;
      setCard(built);
      setState((prev) => {
        const next = reconcileToCard(prev, built);
        if (restoredRef.current) return next;
        /* a visitor with nothing saved still gets the administrator's quotation defaults */
        return {
          ...next,
          quote: {
            customer: next.quote.customer,
            date: todayISO(),
            validityDays: built.settings.defaultValidityDays,
            leadTime: built.settings.defaultLeadTime,
            notes: built.settings.defaultNotes,
          },
        };
      });
    });
    return () => { cancelled = true; };
  }, []);

  /* ---------- catalogue modal: scroll lock, autofocus, Esc + Tab trap ---------- */
  useEffect(() => {
    if (!modalOpen) return;
    document.body.classList.add('overflow-hidden');
    const timer = setTimeout(() => {
      const search = document.getElementById('modal-search');
      if (search) search.focus();
    }, 40);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModalOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const modalEl = document.getElementById('catalog-modal');
      if (!modalEl) return;
      const focusable = Array.prototype.slice.call(
        modalEl.querySelectorAll('button:not([disabled]), input, select, textarea, a[href]'),
      ) as HTMLElement[];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('overflow-hidden');
      if (modalOpener.current && typeof modalOpener.current.focus === 'function') modalOpener.current.focus();
    };
  }, [modalOpen]);


  const openCatalogModal = useCallback(() => {
    modalOpener.current = document.activeElement as HTMLElement;
    setModalOpen(true);
  }, []);

  const closeCatalogModal = useCallback(() => setModalOpen(false), []);

  /* helpers used while rendering */
  const rateSourceText = () => {
    const when = card.info.updatedAt ? ' on ' + fmtDate(String(card.info.updatedAt).slice(0, 10)) : '';
    if (card.info.source === 'server') {
      return 'Rate card: published by the administrator' + when + ' and shared through this local server.';
    }
    if (card.info.source === 'browser') {
      return 'Rate card: saved by the administrator in this browser' + when + '.';
    }
    return 'Rate card: factory defaults - the administrator has not published any changes yet.';
  };

  const manual = q.manual;
  const manualAllowed = card.settings.allowManualMarkup;
  const manualPercent = Math.round((Number(state.manualMarkup) || 0) * 10000) / 100;
  const sliderValue = Math.max(0, Math.min(100, Math.round(manualPercent)));
  const quoteCustomer = (state.quote.customer || '').trim();
  const quoteNotes = (state.quote.notes || '').trim();

  return (
    <>
{/* ================= HEADER ================= */}

    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-emerald-100 shadow-sm no-print">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
                <div className="relative w-10 h-10 shrink-0 rounded-xl bg-gradient-to-tr from-emerald-700 via-green-600 to-lime-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/25">
                    <i className="fa-solid fa-leaf text-lg"></i>
                    <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-lime-400 rounded-full border-2 border-white"></span>
                </div>
                <div className="min-w-0">
                    <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 truncate">
                        <span className="bg-gradient-to-r from-emerald-800 via-green-700 to-lime-600 bg-clip-text text-transparent">MHS Bag</span> Price Calculator
                    </h1>
                    <p className="text-[11px] sm:text-xs text-slate-500 truncate">Live quotation from the non-woven catalogue · quantity based pricing</p>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <button type="button" id="btn-catalog" className="btn-outline" onClick={openCatalogModal}>
                    <i className="fa-solid fa-table-list text-emerald-600"></i>{' '}
                    <span className="hidden sm:inline">Full catalogue</span><span className="sm:hidden">Catalogue</span>
                </button>
                <a href="admin.html" id="admin-link" className="btn-outline" title="Administrator only: markup and rate control (password protected)">
                    <i className="fa-solid fa-lock text-emerald-600"></i>{' '}
                    <span className="hidden lg:inline">Admin</span>
                </a>
            </div>
        </div>
    </header>

    {/* ================= MAIN ================= */}
    <main className="flex-1 w-full max-w-7xl mx-auto px-4 lg:px-6 py-5 space-y-5 pb-28 lg:pb-10">

        {/* Bag type filter */}
        <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 hidden sm:inline">Bag type</span>
            <div id="cat-chips" className="flex items-center gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter the catalogue by bag type">
                <button type="button" className={'chip' + (activeCategory === 'all' ? ' chip-active' : '')} data-cat="all" aria-pressed={activeCategory === 'all'} onClick={() => setCategory('all')}>All bag types <span className="opacity-70 mono" id="count-all">{liveItems.length}</span></button>
                <button type="button" className={'chip' + (activeCategory === 'Box Bag' ? ' chip-active' : '')} data-cat="Box Bag" aria-pressed={activeCategory === 'Box Bag'} onClick={() => setCategory('Box Bag')}>Box bags <span className="opacity-70 mono" id="count-box">{liveItems.filter((b) => b.category === 'Box Bag').length}</span></button>
                <button type="button" className={'chip' + (activeCategory === 'D Cut Bag' ? ' chip-active' : '')} data-cat="D Cut Bag" aria-pressed={activeCategory === 'D Cut Bag'} onClick={() => setCategory('D Cut Bag')}>D-cut bags <span className="opacity-70 mono" id="count-dcut">{liveItems.filter((b) => b.category === 'D Cut Bag').length}</span></button>
                <button type="button" className={'chip' + (activeCategory === 'W Cut Bag' ? ' chip-active' : '')} data-cat="W Cut Bag" aria-pressed={activeCategory === 'W Cut Bag'} onClick={() => setCategory('W Cut Bag')}>W-cut bags <span className="opacity-70 mono" id="count-wcut">{liveItems.filter((b) => b.category === 'W Cut Bag').length}</span></button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

            {/* ============ LEFT: configurator ============ */}
            <div className="lg:col-span-5 space-y-5">

                {/* Bag preview */}
                <section className="card overflow-hidden no-print">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-emerald-100 bg-emerald-50/60">
                        <h2 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                            <i className="fa-solid fa-image text-emerald-600"></i> Bag preview
                        </h2>
                    </div>
                    <BagPreview bag={q.bag} />
                    <p className="px-4 py-2.5 text-[11px] text-slate-500 flex items-center gap-1.5 border-t border-emerald-50">
                        <i className="fa-solid fa-camera text-emerald-600"></i> Factory reference photo of the selected model — the catalogue item ships with this shape and proportion
                    </p>
                </section>
                {/* STEP 1 */}
                <section className="card p-5 space-y-4" aria-labelledby="step-1-title">
                    <h2 id="step-1-title" className="step-title"><span className="step-num">1</span> Choose the bag model</h2>
                    <div>
                        <label className="label" htmlFor="bag-select">Catalogue item</label>
                        <select id="bag-select" className="field" value={state.bagId} onChange={(e) => selectBag(e.target.value)}>
                            {items.map((b) => (
                                <option key={b.id} value={b.id}>{b.name} — {b.ref} · {bagDims(b)}</option>
                            ))}
                        </select>
                        <p className="hint mt-1.5"><i className="fa-solid fa-circle-info mt-px"></i><span id="bag-count-hint">Showing <strong>{items.length}</strong> of {liveItems.length} models{activeCategory === 'all' ? '' : <> in <strong>{activeCategory}</strong></>} · prices update instantly as you type.</span></p>
                    </div>
                    <dl id="bag-specs-card" className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-lime-50/50 p-3.5">
                        <div className="flex items-center justify-between gap-3 text-xs">
                            <dt className="text-slate-500 font-medium">Reference / use case</dt>
                            <dd id="spec-ref" className="font-bold text-emerald-900 text-right">{q.bag.ref}</dd>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3 mt-3 border-t border-emerald-200/70 text-center">
                            <div className="rounded-lg bg-white/85 border border-emerald-100 p-2">
                                <dt className="text-[10px] uppercase font-semibold text-slate-400">GSM</dt>
                                <dd id="spec-gsm" className="mono text-sm font-bold text-slate-800">{q.bag.gsm}</dd>
                            </div>
                            <div className="rounded-lg bg-white/85 border border-emerald-100 p-2">
                                <dt className="text-[10px] uppercase font-semibold text-slate-400">W×H×G</dt>
                                <dd id="spec-dims" className="mono text-sm font-bold text-slate-800">{q.bag.width + '×' + q.bag.height + (q.bag.gusset ? '×' + q.bag.gusset : '')}</dd>
                            </div>
                            <div className="rounded-lg bg-white/85 border border-emerald-100 p-2">
                                <dt className="text-[10px] uppercase font-semibold text-slate-400">Min order</dt>
                                <dd id="spec-min" className="mono text-sm font-bold text-slate-800">{intFmt(q.bag.minQty) + ' bags'}</dd>
                            </div>
                        </div>
                    </dl>
                    <p className="hint pt-1"><i className="fa-solid fa-lock mt-px text-emerald-600"></i><span>Bag costs and markup rates are held on the administrator panel — this page only shows the customer price.</span></p>
                </section>

                {/* STEP 2 */}
                <section className="card p-5 space-y-4" aria-labelledby="step-2-title">
                    <h2 id="step-2-title" className="step-title"><span className="step-num">2</span> Set the order quantity</h2>
                    <div>
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                            <label className="label mb-0" htmlFor="qty-input">Quantity (bags)</label>
                            <span id="tier-badge" className="tag tag-info mono">{manual ? 'Negotiated rate' : 'Rate for ' + q.tier.range + ' bags'}</span>
                        </div>
                        <div className="flex items-stretch gap-2">
                            <button type="button" id="btn-qty-minus" className="btn-outline px-3" aria-label="Decrease quantity" onClick={() => stepQty(-1)}><i className="fa-solid fa-minus"></i></button>
                            <input id="qty-input" className="field mono text-center text-base" type="number" min="1" step="1" inputMode="numeric" value={String(state.qty)} aria-describedby="qty-warning" onChange={(e) => setState((prev) => ({ ...prev, qty: e.target.value }))} onBlur={() => setState((prev) => ({ ...prev, qty: normalizeQty(prev.qty) }))} />
                            <button type="button" id="btn-qty-plus" className="btn-outline px-3" aria-label="Increase quantity" onClick={() => stepQty(1)}><i className="fa-solid fa-plus"></i></button>
                        </div>
                        <div id="qty-presets" className="flex flex-wrap gap-1.5 mt-2.5" role="group" aria-label="Quick quantity presets">
                            <button type="button" className="chip" data-qty="100" onClick={() => setQty(100)}>100</button>
                            <button type="button" className="chip" data-qty="500" onClick={() => setQty(500)}>500</button>
                            <button type="button" className="chip" data-qty="1000" onClick={() => setQty(1000)}>1,000</button>
                            <button type="button" className="chip" data-qty="5000" onClick={() => setQty(5000)}>5,000</button>
                            <button type="button" className="chip" data-qty="10000" onClick={() => setQty(10000)}>10,000</button>
                            <button type="button" className="chip" data-qty="25000" onClick={() => setQty(25000)}>25,000</button>
                        </div>
                    </div>
                    <div id="qty-warning" className="space-y-1.5">
                        {warnings.map(([kind, message]) => (
                            <p key={kind + message} className={'note note-' + kind}>
                                <i className={NOTE_ICONS[kind] + ' mt-px'}></i>
                                <span>{message}</span>
                            </p>
                        ))}
                    </div>
                </section>
                {/* STEP 3 */}
                <section className="card p-5 space-y-4" aria-labelledby="step-3-title">
                    <h2 id="step-3-title" className="step-title"><span className="step-num">3</span> Additional charges</h2>
                    <div>
                        <label className="label" htmlFor="addon-cost-input">Printing / add-on per bag <span className="font-normal text-slate-400">(optional)</span></label>
                        <input id="addon-cost-input" className="field mono" type="number" min="0" step="0.5" inputMode="decimal" placeholder="0.00" value={addonText} onChange={(e) => { setAddonText(e.target.value); setState((prev) => ({ ...prev, addonCost: e.target.value })); }} />
                        <p className="hint mt-1.5"><i className="fa-solid fa-circle-info mt-px"></i><span>Added to every bag — custom printing, extra handles or special packing. Leave it empty for the standard catalogue rate.</span></p>
                    </div>

                    {/* Administrator-only block. Hidden unless "Allow staff markup override" is switched on
                         in the admin dashboard; customer price always comes from the rate card tier. */}
                    <div id="markup-controls" className={'pt-3 border-t border-emerald-50 space-y-2' + (manualAllowed ? '' : ' hidden')} hidden={!manualAllowed}>
                        <p className="note note-warn">
                            <i className="fa-solid fa-user-shield mt-px"></i>
                            <span>Administrator mode: markup override is enabled. Rates you set here apply to this quotation only and are not saved back to the rate card.</span>
                        </p>
                        <div className="flex items-center justify-between gap-3">
                            <span className="label mb-0">Markup applied</span>
                            <div className="inline-flex rounded-xl bg-emerald-50 p-1 border border-emerald-100" role="group" aria-label="Markup mode">
                                <button type="button" id="mode-tier" className="mode-btn" aria-pressed={!manual} onClick={() => setMarkupMode('tier')}>Quantity tier</button>
                                <button type="button" id="mode-manual" className="mode-btn" aria-pressed={manual} onClick={() => setMarkupMode('manual')}>Manual %</button>
                            </div>
                        </div>
                        <div id="manual-markup-wrap" className={'space-y-2 pt-1' + (manual ? '' : ' hidden')}>
                            <div className="flex items-center gap-3">
                                <input id="markup-slider" type="range" min="0" max="100" step="1" value={sliderValue} className="w-full" aria-label="Manual markup percentage slider" onChange={(e) => { const next = Number(e.target.value); setManualText(e.target.value); setState((prev) => ({ ...prev, manualMarkup: next / 100 })); }} />
                                <div className="relative w-24 shrink-0">
                                    <input id="manual-markup-input" className="field mono pr-7 text-right" type="number" min="0" max="500" step="0.5" inputMode="decimal" aria-label="Manual markup percentage" value={manualText} onChange={(e) => { const percent = Math.max(0, Math.min(500, Number(e.target.value) || 0)); setManualText(e.target.value); setState((prev) => ({ ...prev, manualMarkup: percent / 100 })); }} />
                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-700 pointer-events-none">%</span>
                                </div>
                            </div>
                            <button type="button" id="btn-markup-auto" className="link-btn" onClick={() => { setMarkupMode('tier'); showToast('Markup set back to the quantity tier rate.', 'info'); }}>Back to the quantity tier rate</button>
                        </div>
                        <p className="hint"><i className="fa-solid fa-circle-info mt-px"></i><span id="markup-hint">{manual
                            ? 'Negotiated rate of +' + pct(q.markup, 2) + ' is applied to every quantity. The table below is for reference only.'
                            : 'Applied automatically from the ' + q.tier.range + ' rate. Switch to Manual % to quote a custom rate.'}</span></p>
                    </div>
                </section>

            </div>

            {/* ============ RIGHT: live results ============ */}
            <div className="lg:col-span-7 space-y-5">
                {/* Live price summary */}
                <section className="rounded-2xl bg-gradient-to-br from-emerald-800 via-emerald-900 to-green-950 text-white border border-emerald-700 shadow-xl shadow-emerald-900/20 overflow-hidden" aria-labelledby="price-title">
                    <div className="p-5 sm:p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-5 border-b border-emerald-700/60">
                            <div>
                                <h2 id="price-title" className="text-[11px] font-bold uppercase tracking-wider text-lime-400 flex items-center gap-1.5"><i className="fa-solid fa-tag"></i> Price per bag</h2>
                                <div className="flex items-baseline gap-1.5 mt-1">
                                    <span id="out-unit-price" className="mono text-3xl sm:text-4xl font-extrabold" aria-live="polite" aria-atomic="true">{lkr(q.unitPrice)}</span>
                                    <span className="text-xs text-emerald-200">/ bag</span>
                                </div>
                                <p id="out-item-name" className="text-xs text-emerald-200/90 mt-1">{q.bag.name + ' · ' + q.bag.category}</p>
                            </div>
                            <div className="bg-emerald-950/70 border border-emerald-700/70 rounded-xl p-3.5 sm:text-right">
                                <span className="text-[11px] uppercase font-medium text-emerald-300 block">Total order value</span>
                                <span id="out-total-price" className="mono text-2xl font-extrabold text-lime-400">{lkr(q.total)}</span>
                                <span id="out-total-qty" className="block text-[11px] text-emerald-300/80 mt-0.5">{'for ' + intFmt(q.qty) + ' bags'}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 text-xs">
                            <div className="bg-emerald-950/40 border border-emerald-800 rounded-lg p-2.5">
                                <span className="text-emerald-300 block text-[11px]">Printing / add-on</span>
                                <span id="break-addon" className="mono font-bold text-white">{lkr(q.addonCost)}</span>
                            </div>
                            <div className="bg-emerald-950/40 border border-emerald-800 rounded-lg p-2.5">
                                <span className="text-emerald-300 block text-[11px]">Price per 1,000 bags</span>
                                <span id="out-per-1000" className="mono font-bold text-white">{lkr(q.per1000)}</span>
                            </div>
                            <div className="bg-emerald-950/40 border border-emerald-800 rounded-lg p-2.5">
                                <span className="text-emerald-300 block text-[11px]">Saving vs the 100-bag rate</span>
                                <span id="out-savings" className="mono font-bold text-white">{q.savingPerBag > 0.005 ? lkr(q.savingPerBag) + ' / bag' : '—'}</span>
                            </div>
                            <div className="bg-emerald-950/40 border border-emerald-800 rounded-lg p-2.5">
                                <span className="text-emerald-300 block text-[11px]">Saving on this order</span>
                                <span id="out-saving-total" className="mono font-bold text-lime-400">{q.savingTotal > 0.005 ? lkr(q.savingTotal) : '—'}</span>
                            </div>
                        </div>

                        <p id="formula-line" className="mono text-[11px] leading-relaxed text-emerald-100 bg-emerald-950/50 border border-emerald-700/60 rounded-lg px-3 py-2.5 mt-4">{lkr(q.unitPrice) + ' / bag × ' + intFmt(q.qty) + ' bags = ' + lkr(q.total) + (q.addonCost > 0 ? '   (includes ' + lkr(q.addonCost) + ' printing / add-on per bag)' : '')}</p>

                        <div className="flex flex-wrap gap-2.5 mt-5">
                            <button type="button" id="btn-copy" className="btn btn-lime flex-1 min-w-[170px]" onClick={copyQuotation}>
                                <i className="fa-regular fa-copy"></i> Copy quotation
                            </button>
                            <button type="button" id="btn-print" className="btn btn-dark no-print" onClick={printQuotation}>
                                <i className="fa-solid fa-print"></i> Print / PDF
                            </button>
                            <button type="button" id="btn-reset" className="btn btn-dark no-print" onClick={resetQuote}>
                                <i className="fa-solid fa-rotate-left"></i> Reset
                            </button>
                        </div>
                    </div>
                </section>

                {/* Quotation details */}
                <section className="card p-5 space-y-4 no-print" aria-labelledby="quote-details-title">
                    <h2 id="quote-details-title" className="step-title"><span className="step-num">4</span> Quotation details</h2>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                            <label className="label" htmlFor="quote-customer">Prepared for</label>
                            <input id="quote-customer" className="field" type="text" placeholder="Customer / company name" autoComplete="organization" value={state.quote.customer} onChange={(e) => setState((prev) => ({ ...prev, quote: { ...prev.quote, customer: e.target.value } }))} />
                        </div>
                        <div>
                            <label className="label" htmlFor="quote-date">Quotation date</label>
                            <input id="quote-date" className="field mono" type="date" value={state.quote.date} onChange={(e) => setState((prev) => ({ ...prev, quote: { ...prev.quote, date: e.target.value || todayISO() } }))} />
                        </div>
                        <div>
                            <label className="label" htmlFor="quote-validity">Valid for (days)</label>
                            <input id="quote-validity" className="field mono" type="number" min="1" max="365" step="1" value={String(state.quote.validityDays)} onChange={(e) => setState((prev) => ({ ...prev, quote: { ...prev.quote, validityDays: Math.max(1, Math.min(365, Number(e.target.value) || 1)) } }))} />
                        </div>
                        <div>
                            <label className="label" htmlFor="quote-leadtime">Production lead time</label>
                            <input id="quote-leadtime" className="field" type="text" value={state.quote.leadTime} onChange={(e) => setState((prev) => ({ ...prev, quote: { ...prev.quote, leadTime: e.target.value } }))} />
                        </div>
                    </div>
                    <div>
                        <label className="label" htmlFor="quote-notes">Notes / terms <span className="font-normal text-slate-400">(optional)</span></label>
                        <textarea id="quote-notes" className="field" rows={2} placeholder="e.g. Prices exclude delivery. 50% advance payment with the order." value={state.quote.notes} onChange={(e) => setState((prev) => ({ ...prev, quote: { ...prev.quote, notes: e.target.value } }))}></textarea>
                    </div>
                    <p className="hint"><i className="fa-solid fa-lightbulb mt-px text-amber-500"></i><span>These details appear on the quotation sheet below and in the copied / printed quote.</span></p>
                </section>
                {/* Quotation sheet (this exact block is printed / copied) */}
                <section className="card p-5">
                    <div className="flex items-center justify-between gap-3 mb-4 no-print">
                        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2"><span className="step-num">5</span> Quotation sheet</h2>
                        <span className="text-[11px] text-slate-500 font-medium">Printed / copied exactly as shown</span>
                    </div>
                    <div id="print-area" className="rounded-xl border border-emerald-100 bg-white p-5">
                        <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-emerald-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-700 to-lime-500 text-white flex items-center justify-center"><i className="fa-solid fa-leaf"></i></div>
                                <div>
                                    <p className="font-extrabold text-slate-900 tracking-tight leading-tight">{card.settings.companyName}</p>
                                    <p className="text-[11px] text-slate-500">{card.settings.companyTagline}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">Quotation</p>
                                <p className="mono text-[11px] text-slate-600">{QUOTE_REF}</p>
                                <p className="text-[11px] text-slate-500">{fmtDate(state.quote.date)}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 py-4 text-xs">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-slate-400">Prepared for</p>
                                <p className="font-semibold text-slate-800">{quoteCustomer || '—'}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] uppercase font-bold text-slate-400">Valid until</p>
                                <p className="font-semibold text-slate-800">{fmtDate(q.validUntil)}</p>
                            </div>
                        </div>

                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Specification</th>
                                    <th className="num">Qty</th>
                                    <th className="num">Unit price</th>
                                    <th className="num">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>
                                        <span className="t-strong block">{q.bag.name}</span>
                                        <span className="t-muted">{q.bag.ref}</span>
                                    </td>
                                    <td className="t-muted mono">{q.dims} · {q.bag.gsm} GSM</td>
                                    <td className="num mono">{intFmt(q.qty)}</td>
                                    <td className="num mono">{lkr(q.unitPrice)}</td>
                                    <td className="num mono t-strong">{lkr(q.total)}</td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="flex justify-end mt-4">
                            <div className="w-full sm:w-80 text-[12px] space-y-1.5">
                                <div className="flex justify-between"><span className="t-muted">Rate for {intFmt(q.qty)} bags</span><span className="mono t-strong">{lkr(q.unitBeforeAddon)}</span></div>
                                {q.addonCost > 0 ? <div className="flex justify-between"><span className="t-muted">Printing / add-on per bag</span><span className="mono t-strong">{lkr(q.addonCost)}</span></div> : null}
                                <div className="flex justify-between border-t border-emerald-100 pt-1.5"><span className="font-semibold text-slate-700">Unit price per bag</span><span className="mono t-price">{lkr(q.unitPrice)}</span></div>
                                <div className="flex justify-between bg-emerald-50 rounded-lg px-2 py-1.5"><span className="font-bold text-emerald-900">Total order value</span><span className="mono font-extrabold text-emerald-900">{lkr(q.total)}</span></div>
                                <div className="flex justify-between"><span className="t-muted">Price per 1,000 bags</span><span className="mono t-muted">{lkr(q.per1000)}</span></div>
                            </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-emerald-100 text-[11px] text-slate-600 space-y-1">
                            <p><span className="font-semibold text-slate-700">Production lead time:</span> {state.quote.leadTime || '—'}</p>
                            <p><span className="font-semibold text-slate-700">Validity:</span> valid for {String(state.quote.validityDays)} day(s) from the date above.</p>
                            {quoteNotes ? <p><span className="font-semibold text-slate-700">Notes:</span> {quoteNotes}</p> : null}
                            <p className="text-slate-500">All prices are in Sri Lankan Rupees (LKR). Price per bag reflects the order quantity rate for {q.tier.range} bags{q.manual ? ' and an agreed negotiated rate for this order' : ''}.</p>
                        </div>
                    </div>
                </section>

                {/* Pricing tiers */}
                <section className="card p-5 space-y-3" aria-labelledby="tiers-title">
                    <div className="flex items-start justify-between gap-3">
                        <h2 id="tiers-title" className="step-title border-0 pb-0 mb-0"><span className="step-num">6</span> Quantity pricing tiers</h2>
                        <span id="tier-note" className={'tag shrink-0 ' + (manual ? 'tag-lime' : 'tag-info')}>{manual ? 'Negotiated rate' : 'Rate for ' + q.tier.short}</span>
                    </div>
                    <div className="scroll-x">
                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th>Order quantity</th>
                                    <th className="num">Price / bag</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody id="tier-rows">
                                {card.tiers.map((tier) => {
                                    const tierMarkup = q.bag.markup == null ? tier.markup : q.bag.markup;
                                    const price = q.baseCost * (1 + tierMarkup) + q.addonCost;
                                    const inQtyTier = q.qty >= tier.min && q.qty <= tier.max;
                                    const applied = manual ? Math.abs(tierMarkup - q.markup) < 1e-9 : inQtyTier;
                                    return (
                                        <tr key={tier.min} className={applied ? 'tier-row-active' : ''}>
                                            <td className="t-strong mono">{tier.range}</td>
                                            <td className="num t-price mono">{lkr(price)}</td>
                                            <td className="t-muted">{applied
                                                ? <span className="tag tag-active">Applied</span>
                                                : inQtyTier
                                                    ? <span className="tag tag-info">Your quantity</span>
                                                    : <button type="button" className="btn-tiny" data-qty={tier.min} onClick={() => setQty(tier.min)}>{'Quote at ' + tier.short}</button>}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <p className="hint pt-1"><i className="fa-solid fa-circle-info mt-px"></i><span>The price per bag depends on the order quantity — larger orders automatically get the better rate. Order amounts are calculated at full precision, so a rounded unit price multiplied by the quantity can differ by a few cents.</span></p>
                    <p id="rate-source" className="hint pt-1"><i className="fa-solid fa-shield-halved mt-px text-emerald-600"></i><span>{rateSourceText()}</span></p>
                </section>

            </div>{/* /right column */}
        </div>{/* /grid */}
    </main>
    {/* ================= MOBILE STICKY SUMMARY ================= */}
    <div id="mobile-bar" className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-emerald-950/95 backdrop-blur border-t border-emerald-800 px-4 py-2.5 flex items-center justify-between gap-3 no-print">
        <div className="min-w-0">
            <span className="block text-[10px] uppercase tracking-wider text-emerald-400">Per bag</span>
            <span id="m-unit" className="mono font-bold text-white text-sm">{lkr(q.unitPrice)}</span>
        </div>
        <div className="text-right min-w-0">
            <span className="block text-[10px] uppercase tracking-wider text-emerald-400">Total · <span id="m-qty">{intFmt(q.qty)}</span> bags</span>
            <span id="m-total" className="mono font-bold text-lime-400 text-sm">{lkr(q.total)}</span>
        </div>
        <button type="button" id="m-copy" className="btn btn-lime px-3 py-2 text-xs shrink-0" aria-label="Copy the quotation" onClick={copyQuotation}><i className="fa-regular fa-copy"></i></button>
    </div>

    {/* ================= CATALOGUE MODAL ================= */}
    <div id="catalog-modal" className={(modalOpen ? '' : 'hidden ') + 'fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm overflow-y-auto no-print'} onMouseDown={(e) => { if (e.target === e.currentTarget) closeCatalogModal(); }} role="dialog" aria-modal="true" aria-labelledby="catalog-modal-title">
        <div className="mx-auto w-full max-w-6xl min-h-full sm:min-h-0 sm:my-6 bg-white sm:rounded-2xl shadow-2xl border border-emerald-100 overflow-hidden">
            <div className="bg-white border-b border-emerald-100 px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
                <div>
                    <h2 id="catalog-modal-title" className="text-base font-extrabold text-slate-900 flex items-center gap-2"><i className="fa-solid fa-table-list text-emerald-600"></i> Full bag catalogue</h2>
                    <p id="modal-result-count" className="text-[11px] text-slate-500">{'Showing ' + modalItems.length + ' of ' + liveItems.length + ' models · prices are per bag at ' + intFmt(normalizeQty(state.qty)) + ' bags'}</p>
                </div>
                <button type="button" id="modal-close" className="btn-outline" aria-label="Close the catalogue" onClick={closeCatalogModal}><i className="fa-solid fa-xmark"></i> Close</button>
            </div>
            <div className="px-4 sm:px-5 py-3.5 space-y-3 bg-emerald-50/40 border-b border-emerald-100">
                <div className="flex flex-col sm:flex-row gap-2.5">
                    <div className="relative flex-1">
                        <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 text-xs"></i>
                        <input id="modal-search" className="field pl-9" type="search" placeholder="Search by name, reference, GSM or bag type…" aria-label="Search the catalogue" value={modal.query} onChange={(e) => setModal((prev) => ({ ...prev, query: e.target.value }))} />
                    </div>
                    <select id="modal-sort" className="field sm:w-56" aria-label="Sort the catalogue" value={modal.sort} onChange={(e) => setModal((prev) => ({ ...prev, sort: e.target.value }))}>
                        <option value="default">Catalogue order</option>
                        <option value="name">Name (A–Z)</option>
                        <option value="category">Bag type</option>
                        <option value="minorder">Minimum order (low → high)</option>
                        <option value="size">Bag size (large → small)</option>
                    </select>
                </div>
                <div id="modal-cat-chips" className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by bag type">
                    <button type="button" className={'chip' + (modal.cat === 'all' ? ' chip-active' : '')} data-mcat="all" aria-pressed={modal.cat === 'all'} onClick={() => setModal((prev) => ({ ...prev, cat: 'all' }))}>All</button>
                    <button type="button" className={'chip' + (modal.cat === 'Box Bag' ? ' chip-active' : '')} data-mcat="Box Bag" aria-pressed={modal.cat === 'Box Bag'} onClick={() => setModal((prev) => ({ ...prev, cat: 'Box Bag' }))}>Box bags</button>
                    <button type="button" className={'chip' + (modal.cat === 'D Cut Bag' ? ' chip-active' : '')} data-mcat="D Cut Bag" aria-pressed={modal.cat === 'D Cut Bag'} onClick={() => setModal((prev) => ({ ...prev, cat: 'D Cut Bag' }))}>D-cut bags</button>
                    <button type="button" className={'chip' + (modal.cat === 'W Cut Bag' ? ' chip-active' : '')} data-mcat="W Cut Bag" aria-pressed={modal.cat === 'W Cut Bag'} onClick={() => setModal((prev) => ({ ...prev, cat: 'W Cut Bag' }))}>W-cut bags</button>
                </div>
            </div>
            <div className="scroll-x">
                <table className="tbl">
                    <thead>
                        <tr>
                            <th>Bag model</th>
                            <th>Category</th>
                            <th>Reference</th>
                            <th>GSM</th>
                            <th>W×H×G (cm)</th>
                            <th className="num">Min order</th>
                            <th className="num">Price / bag</th>
                            <th className="num">Action</th>
                        </tr>
                    </thead>
                    <tbody id="catalog-modal-table">
                        {!modalItems.length ? (
                            <tr><td colSpan={8} className="center t-muted">No models match “{modal.query}”. Try another search or bag type.</td></tr>
                        ) : modalItems.map((b) => {
                            const current = b.id === state.bagId;
                            return (
                                <tr key={b.id} className={current ? 'tier-row-active' : ''}>
                                    <td><span className="t-strong">{b.name}</span> {current ? <span className="tag tag-active">Selected</span> : null}</td>
                                    <td className="t-muted">{b.category}</td>
                                    <td className="t-accent">{b.ref}</td>
                                    <td className="t-muted mono">{b.gsm}</td>
                                    <td className="t-muted mono">{b.width + '×' + b.height + (b.gusset ? '×' + b.gusset : '')}</td>
                                    <td className="num t-muted mono">{intFmt(b.minQty)}</td>
                                    <td className="num t-price mono">{lkr(unitPriceFor(b, card.tiers, normalizeQty(state.qty)))}</td>
                                    <td className="num"><button type="button" className="btn-tiny" data-bag={b.id} disabled={current} onClick={() => { selectBag(b.id, { toast: true }); closeCatalogModal(); }}>{current ? 'In use' : 'Select'}</button></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="px-4 sm:px-5 py-3 text-[11px] text-slate-500 border-t border-emerald-50">Pick any model to price it instantly — the rate card is applied automatically by order quantity. Press <kbd>Esc</kbd> to close.</p>
        </div>
    </div>

    {/* ================= TOAST ================= */}
    <div id="toast" className={'toast toast-' + toast.kind + (toast.open ? '' : ' toast-hidden')} role="status" aria-live="polite">
        <i id="toast-icon" className={TOAST_ICONS[toast.kind] + (toast.open ? ' text-base' : '')}></i>
        <span id="toast-text">{toast.message}</span>
    </div>
    {/* ================= APPLICATION SCRIPT ================= */}
    </>
  );
}
