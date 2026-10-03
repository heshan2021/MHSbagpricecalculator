/* The administrator panel's state machine. Every module-level variable of the legacy script
   (rates, source, draft, dirty, errors, unlocked, authHash, previewBagId, idleTimer) is state
   here, and every render*() function it had is derived during the React render - the panel is
   only ever "locked" or "unlocked", so there are no partial updates to keep in step. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import {
  CATEGORIES, DEFAULT_HASH, FACTORY, IDLE_LOCK_MS, MAX_LOG, RATES_KEY,
  bandShort, deepClone, diffSummary, fmtDateTime, forgetSession, hashFromSession, hashPassword,
  loadRateCard, lowBand, markupFor, midBand, normaliseDoc, normaliseTiers, numv, pctInputValue,
  pctText, priceFor, publishRateDoc, rememberSession, validateDraft,
} from '../../core/admin.ts';
import type { AdminDoc, Issue } from '../../core/admin.ts';
import type { Bag, FactorySettings, Tier } from '../../core/factory.ts';
import type { RateSource } from '../../core/types.ts';
import { lkr } from '../../core/format.ts';

export type ToastKind = 'success' | 'info' | 'warn';

/** The little note boxes the legacy script built with innerHTML. */
export interface Note {
  kind: 'ok' | 'bad' | 'warn' | 'info';
  icon: string;
  content: ReactNode;
}

export interface AdminPanel {
  /* chrome outside the dashboard */
  unlocked: boolean;
  lockScreenClass: string;
  dashboardClass: string;
  lockButtonClass: string;
  lockMessage: { icon: string; text: string } | null;
  lockSourceClass: string;
  lockSource: ReactNode;
  password: string;
  onPasswordChange: (value: string) => void;
  passwordRef: RefObject<HTMLInputElement>;
  onUnlock: () => void;

  /* toast */
  toastClass: string;
  toastIconClass: string;
  toastText: string;

  /* status row */
  pillDirtyClass: string;
  pillDirty: ReactNode;
  pillSourceClass: string;
  pillSource: ReactNode;
  pillUpdated: ReactNode;
  source: RateSource;

  /* save bar */
  saveLocal: boolean;
  onToggleSaveLocal: (value: boolean) => void;
  saveServer: boolean;
  onToggleSaveServer: (value: boolean) => void;
  serverDisabled: boolean;
  serverTitle: string;
  canSave: boolean;
  saveBarClass: string;
  saveBarText: ReactNode;
  onSave: () => void;
  onRevert: () => void;
  onLock: () => void;
  onExport: () => void;
  saveMessageClass: string;
  saveMessage: Note | null;

  /* validation */
  errorBoxClass: string;
  errors: Issue[];
  badBag: Record<string, boolean>;
  badTier: Record<string, boolean>;
  badSet: Record<string, boolean>;

  /* bands */
  draftReady: boolean;
  tiers: Tier[];
  midQty: number;
  tierMult: (tier: Tier) => string;
  tierPrice: (tier: Tier) => number;
  tierProfit: (tier: Tier) => number;
  thMid: string;
  thLow: string;
  onTierInput: (index: number, field: string, value: string) => void;
  onTierAction: (action: string, index: number) => void;
  onAddTier: () => void;
  onTidyTiers: () => void;
  /* counted up whenever the legacy script rebuilds #tier-rows / #bag-rows with innerHTML */
  tierGen: number;

  /* models */
  bags: Bag[];
  visibleBags: { bag: Bag; index: number }[];
  filter: string;
  onFilterChange: (value: string) => void;
  bagTotal: string;
  bagEff: (bag: Bag) => string;
  bagRate: (bag: Bag) => string;
  bagLow: (bag: Bag) => string;
  onBagInput: (index: number, field: string, value: string, checked?: boolean) => void;
  onBagAction: (action: string, index: number) => void;
  onAddBag: () => void;
  bagGen: number;

  /* settings */
  settings: FactorySettings | null;
  onSettingInput: (key: string, value: string, checked?: boolean) => void;

  /* 3D preview picker */
  previewOptions: { id: string; label: string }[];
  previewValue: string;
  onPreviewChange: (id: string) => void;

  /* password change */
  pwCurrent: string;
  pwNew: string;
  pwConfirm: string;
  onPwCurrentChange: (value: string) => void;
  onPwNewChange: (value: string) => void;
  onPwConfirmChange: (value: string) => void;
  pwMessageClass: string;
  pwMessage: Note | null;
  onChangePassword: () => void;

  /* export / import / reset */
  importText: string;
  onImportTextChange: (value: string) => void;
  onImportText: () => void;
  onImportFile: (file: File | null) => void;
  onReset: () => void;

  /* activity log */
  log: { at: string; action: string; detail: string }[];
}

const TOAST_ICONS: Record<ToastKind, string> = {
  success: 'fa-solid fa-circle-check',
  info: 'fa-solid fa-circle-info',
  warn: 'fa-solid fa-triangle-exclamation',
};

export function useAdminPanel(): AdminPanel {
  const [rates, setRates] = useState<AdminDoc | null>(null);
  const [source, setSource] = useState<RateSource>('factory');
  const [draft, setDraft] = useState<AdminDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Issue[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [previewBagId, setPreviewBagId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [lockMessage, setLockMessage] = useState<{ icon: string; text: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState<Note | null>(null);
  const [pwMessage, setPwMessage] = useState<Note | null>(null);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [importText, setImportText] = useState('');
  const [saveLocal, setSaveLocal] = useState(true);
  const [saveServer, setSaveServer] = useState(true);
  const [filter, setFilter] = useState('');

  const authHash = useRef<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const hasServer = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
  /* the legacy panel cleared the "publish" tick box itself when the page is opened from a file */
  const serverChecked = hasServer ? saveServer : false;

  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  /* ---------- toast (legacy showToast) ---------- */
  const [toastKind, setToastKind] = useState<ToastKind>('success');
  const [toastText, setToastText] = useState('');
  const [toastShown, setToastShown] = useState(false);
  const [toastHidden, setToastHidden] = useState(true);

  function showToast(message: string, kind?: ToastKind) {
    const type = kind || 'success';
    setToastKind(type);
    setToastText(message);
    setToastShown(true);
    setToastHidden(false);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastHidden(true), 3800);
  }

  function showSaveMessage(kind: Note['kind'], content: ReactNode) {
    const icon = kind === 'ok' ? 'fa-circle-check' : (kind === 'bad' ? 'fa-circle-exclamation' : 'fa-triangle-exclamation');
    setSaveMessage({ kind, icon, content });
  }

  /* ---------- edit session (legacy startEditing + renderAll) ---------- */
  function startEditing(from: AdminDoc) {
    const next = deepClone(from);
    const first = next.bags.filter((b) => b.active)[0] || next.bags[0];
    setDraft(next);
    setPreviewBagId(first ? first.id : null);
    setDirty(false);
    setErrors(validateDraft(next));
    bumpTables();                         // renderAll()
    syncPreviewOptions(next);
  }

  /* One change that is re-rendered and re-validated straight away (legacy render* + revalidate).
     Structural tier edits rebuilt only #tier-rows and bag edits only #bag-rows in the legacy page, so
     the other table kept whatever was typed into its cells - that is what the scope decides. */
  function commit(next: AdminDoc, scope: 'tiers' | 'bags' | 'all' = 'all', message?: string, kind?: ToastKind) {
    setDraft(next);
    setDirty(true);
    setErrors(validateDraft(next));
    if (scope !== 'bags') setTierGen((g) => g + 1);   // renderTierTable()
    if (scope !== 'tiers') {                          // renderBags()
      setBagGen((g) => g + 1);
      syncPreviewOptions(next);                       // add/duplicate/delete rebuilt the picker too
    }
    if (message) showToast(message, kind || 'info');
  }

  /* a keystroke: dirty at once, validation after the legacy 300 ms of quiet */
  function edit(next: AdminDoc) {
    setDraft(next);
    setDirty(true);
  }

  /* The legacy page replaced a table's innerHTML only where the script said so: a keystroke leaves the
     text you typed on screen (typing 99.99 into "from qty" shows 99.99 while the draft holds 99),
     while a structural change, a new preview model, a filter or a full renderAll put the draft value
     back into every cell. These two counters remount the rows at exactly those moments. */
  const [tierGen, setTierGen] = useState(0);
  const [bagGen, setBagGen] = useState(0);
  const bumpTables = () => { setTierGen((g) => g + 1); setBagGen((g) => g + 1); };   // renderAll()

  /* legacy renderPreviewOptions(). Only renderAll(), add, duplicate and delete rebuilt the picker,
     so ticking "In use" or retyping a model's name left the option labels on screen as they were
     until the next structural change. The labels are state for that reason, not derived. */
  const [previewOptions, setPreviewOptions] = useState<{ id: string; label: string }[]>([]);
  function syncPreviewOptions(from: AdminDoc) {
    setPreviewOptions(from.bags.map((b) => ({
      id: b.id, label: (b.name || 'Unnamed model') + (b.active ? '' : ' (not in use)'),
    })));
  }

  /* ---------- signing in and out ---------- */
  function lockPanel(reason: string | null) {
    setUnlocked(false);
    setDirty(false);
    setDraft(null);
    setErrors([]);
    forgetSession();
    setPassword('');
    setLockMessage(reason ? { icon: 'fa-solid fa-circle-info mt-px', text: reason } : null);
    if (reason) showToast(reason, 'info');
    window.setTimeout(() => passwordRef.current?.focus(), 60);
  }

  function touchActivity() {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      if (dirtyRef.current) {
        showToast('Still signed in - your unsaved changes are waiting.', 'warn');
        touchActivity();
        return;
      }
      lockPanel('The panel locked itself after 15 minutes of inactivity.');
    }, IDLE_LOCK_MS);
  }

  function attemptUnlock() {
    if (!rates) {
      setLockMessage({ icon: 'fa-solid fa-circle-info mt-px', text: 'The rate card is still loading - try again in a moment.' });
      return;
    }
    if (!password) {
      setLockMessage({ icon: 'fa-solid fa-circle-info mt-px', text: 'Enter the administrator password.' });
      return;
    }
    const hash = hashPassword(password);
    if (hash !== rates.security.adminHash) {
      setLockMessage({ icon: 'fa-solid fa-triangle-exclamation mt-px', text: 'Wrong password. Try again, or read the password help below.' });
      passwordRef.current?.select();
      return;
    }
    authHash.current = hash;
    rememberSession(hash);
    setLockMessage(null);
    startEditing(rates);
    setUnlocked(true);
    showToast('Signed in as administrator.', 'success');
    touchActivity();
  }

  /* ---------- boot: load the copy the calculator shows ---------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      const loaded = await loadRateCard();
      if (!alive) return;
      setRates(loaded.rates);
      setSource(loaded.source);
      const session = hashFromSession();
      if (session && session === loaded.rates.security.adminHash) {
        authHash.current = session;
        startEditing(loaded.rates);
        setUnlocked(true);
        touchActivity();
      } else {
        window.setTimeout(() => passwordRef.current?.focus(), 80);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* the panel only listens for activity while somebody is signed in (legacy touchActivity guard) */
  useEffect(() => {
    if (!unlocked) return undefined;
    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach((name) => document.addEventListener(name, touchActivity, { passive: true }));
    touchActivity();
    return () => events.forEach((name) => document.removeEventListener(name, touchActivity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  /* legacy debouncedValidate() - 300 ms after the last keystroke */
  useEffect(() => {
    if (!draft) return undefined;
    const timer = window.setTimeout(() => setErrors(validateDraft(draft)), 300);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return undefined;
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  /* ---------- saving, publishing, reverting ---------- */
  async function saveChanges() {
    if (!draft || !rates) return;
    const found = validateDraft(draft);
    setErrors(found);

    const bad = found.filter((e) => e.level !== 'warn');
    if (bad.length) {
      showSaveMessage('bad', 'Nothing was saved - fix the ' + bad.length + ' problem' + (bad.length > 1 ? 's' : '') + ' marked in red above.');
      showToast('Fix the ' + bad.length + ' problem' + (bad.length > 1 ? 's' : '') + ' first.', 'warn');
      return;
    }
    if (!saveLocal && !serverChecked) {
      showSaveMessage('warn', 'Nothing was written: tick “save in this browser” and/or “publish to the local server”.');
      showToast('Tick at least one save option.', 'warn');
      return;
    }

    const previous = rates;
    const next = normaliseDoc(deepClone(draft));
    next.updatedAt = new Date().toISOString();
    next.security.adminHash = draft.security.adminHash;
    next.log = (previous.log || []).concat([{
      at: next.updatedAt,
      action: serverChecked ? (saveLocal ? 'Saved and published' : 'Published') : 'Saved in this browser',
      detail: diffSummary(previous, next),
    }]).slice(-MAX_LOG);

    const notes: string[] = [];
    let publishError: string | null = null;

    if (saveLocal) {
      try {
        localStorage.setItem(RATES_KEY, JSON.stringify(next));
        notes.push('saved in this browser');
      } catch (err) {
        showSaveMessage('bad', 'This browser refused to store the rate card (' + ((err as Error).message || 'storage blocked') + '). Nothing was published.');
        return;
      }
    }

    if (serverChecked) {
      try {
        await publishRateDoc(next, authHash.current);
        notes.push('published to the local server');
        authHash.current = next.security.adminHash;   // catalog.json now carries this hash
        rememberSession(authHash.current);
        setSource('server');
      } catch (err) {
        publishError = (err as Error).message || 'unknown error';
      }
    }

    setRates(next);
    setDraft(deepClone(next));
    setDirty(false);
    setErrors(validateDraft(next));       // renderAll()
    bumpTables();
    syncPreviewOptions(next);

    if (publishError) {
      showSaveMessage('warn', <>Saved in this browser, but publishing to the server failed: {publishError}. Keep <span className="mono">node serve.js</span> running and save again, or use Export JSON to move the file by hand.</>);
      showToast('Publishing failed - the browser copy was saved.', 'warn');
      return;
    }
    if (notes.length) {
      showSaveMessage('ok', <>Done - {notes.join(' and ')}. The calculator shows the new prices the next time it loads.</>);
      showToast('Rate card saved.', 'success');
    }
  }

  function revertDraft() {
    if (!dirty || !rates) return;
    if (!confirm('Throw away the unsaved changes and reload the published rate card?')) return;
    const next = deepClone(rates);
    const first = next.bags.filter((b) => b.active)[0] || next.bags[0];
    setDraft(next);
    setPreviewBagId(first ? first.id : null);
    setDirty(false);
    setSaveMessage(null);                 // legacy: save-message.className = 'pt-3 hidden'
    setErrors(validateDraft(next));       // renderAll()
    bumpTables();
    syncPreviewOptions(next);
    showToast('Changes discarded.', 'info');
  }

  /* ---------- export / import / reset ---------- */
  function exportJson() {
    if (!draft) return;
    const doc = normaliseDoc(deepClone(draft));
    doc.updatedAt = new Date().toISOString();
    const name = 'mhs-rate-card-' + doc.updatedAt.slice(0, 10) + '.json';
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast('Exported ' + name + '.', 'success');
  }

  function applyImported(raw: unknown, label: string) {
    const doc = raw as Record<string, any> | null;
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.bags) || !doc.bags.length) {
      showToast('That does not look like a rate card (no bags array).', 'warn');
      return;
    }
    const next = normaliseDoc(doc);
    const first = next.bags.filter((b) => b.active)[0] || next.bags[0];
    setDraft(next);
    setPreviewBagId(first ? first.id : null);
    setErrors(validateDraft(next));       // renderAll()
    bumpTables();
    syncPreviewOptions(next);
    setDirty(true);
    showSaveMessage('info', <>Imported {label} ({next.bags.length} models, {next.tiers.length} bands). Check it over, then press <strong>Save changes</strong>.</>);
    showToast('Rate card imported - remember to save.', 'info');
  }

  function importFromText() {
    const text = String(importText || '').trim();
    if (!text) {
      showToast('Paste the JSON first.', 'warn');
      return;
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      showToast('That JSON could not be parsed: ' + (err as Error).message, 'warn');
      return;
    }
    applyImported(parsed, 'the pasted JSON');
  }

  function importFromFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(String(reader.result || ''));
      } catch (err) {
        showToast('That file is not valid JSON: ' + (err as Error).message, 'warn');
        return;
      }
      applyImported(parsed, file.name);
      setImportText('');
    };
    reader.onerror = () => showToast('The file could not be read.', 'warn');
    reader.readAsText(file);
  }

  function resetToFactory() {
    if (!draft) return;
    if (!confirm('Replace every band, model and setting with the factory rate card? Nothing is written until you press Save changes.')) return;
    const keepHash = draft.security.adminHash;   // the password survives a reset
    const next = normaliseDoc(deepClone(FACTORY));
    next.security.adminHash = keepHash;
    const first = next.bags.filter((b) => b.active)[0] || next.bags[0];
    setDraft(next);
    setPreviewBagId(first ? first.id : null);
    setErrors(validateDraft(next));       // renderAll()
    bumpTables();
    syncPreviewOptions(next);
    setDirty(true);
    showSaveMessage('info', <>Factory values loaded (your password was kept). Press <strong>Save changes</strong> to apply them.</>);
    showToast('Factory rate card loaded.', 'info');
  }

  /* ---------- password change ---------- */
  function changePassword() {
    if (!draft) return;
    const current = String(pwCurrent || '');
    const next = String(pwNew || '');
    const again = String(pwConfirm || '');

    const fail = (message: string) => {
      setPwMessage({ kind: 'bad', icon: 'fa-solid fa-circle-exclamation mt-px', content: message });
    };

    if (hashPassword(current) !== draft.security.adminHash) return fail('The current password is not right.');
    if (next.length < 8) return fail('Use at least 8 characters for the new password.');
    if (next !== again) return fail('The two new passwords do not match.');
    if (hashPassword(next) === draft.security.adminHash) return fail('That is already the current password.');

    const updated = deepClone(draft);
    updated.security.adminHash = hashPassword(next);
    setDraft(updated);
    setPwCurrent('');
    setPwNew('');
    setPwConfirm('');
    setPwMessage({
      kind: 'warn',
      icon: 'fa-solid fa-triangle-exclamation mt-px',
      content: <>Password changed in the draft only. Press <strong>Save changes</strong> to make it permanent, then sign in with the new password next time.</>,
    });
    setDirty(true);
    showToast('Password updated in the draft - remember to save.', 'info');
  }

  /* ---------- structural edits (legacy section 7) ---------- */
  function addTier() {
    if (!draft) return;
    const list = deepClone(draft.tiers);
    const last = list[list.length - 1];
    let start = 1;
    if (last) {
      start = last.max == null ? last.min * 2 : last.max * 2 + 1;
      if (last.max == null) last.max = Math.max(last.min, start - 1);
    }
    list.push({ min: Math.max(1, start), max: null, markup: last ? last.markup : 0.30 });
    commit({ ...draft, tiers: normaliseTiers(list) }, 'tiers', 'Band added - set its quantity range and markup.', 'info');
  }

  function tidyTiers() {
    if (!draft) return;
    const list = draft.tiers.slice().sort((a, b) => a.min - b.min);
    for (let i = 1; i < list.length; i++) {
      const prevMax = list[i - 1].max;
      if (prevMax != null && list[i].min <= prevMax) list[i].min = prevMax + 1;
    }
    for (let i = 0; i < list.length - 1; i++) {
      list[i].max = Math.max(list[i].min, list[i + 1].min - 1);
    }
    if (list.length) list[list.length - 1].max = null;
    commit({ ...draft, tiers: list }, 'tiers', 'The bands now follow each other without gaps.', 'success');
  }

  function deleteTier(index: number) {
    if (!draft) return;
    if (draft.tiers.length <= 1) {
      showToast('At least one band has to stay.', 'warn');
      return;
    }
    if (!confirm('Remove band ' + (index + 1) + '?')) return;
    const tiers = draft.tiers.slice();
    tiers.splice(index, 1);
    commit({ ...draft, tiers: normaliseTiers(tiers) }, 'tiers');
  }

  function addBagFrom(doc: AdminDoc, message?: string) {
    let n = 1;
    while (doc.bags.some((b) => b.id === 'bag_' + n)) n += 1;
    const bags = doc.bags.concat([{
      id: 'bag_' + n, category: 'Box Bag', name: 'New bag model', ref: '', gsm: '',
      width: 30, height: 35, gusset: 10, minQty: doc.settings.minOrderQty,
      cost: 0, markup: null, active: true,
    } as Bag]);
    commit({ ...doc, bags }, 'bags', message, 'info');
  }

  function addBag() {
    if (!draft) return;
    addBagFrom(draft, 'Model added - fill in its name and base cost.');
  }

  function duplicateBag(index: number) {
    if (!draft) return;
    const source = draft.bags[index];
    if (!source) return;
    let n = 1;
    while (draft.bags.some((b) => b.id === source.id + '_copy' + n)) n += 1;
    const copy = deepClone(source);
    copy.id = source.id + '_copy' + n;
    copy.name = source.name + ' (copy)';
    const bags = draft.bags.slice();
    bags.splice(index + 1, 0, copy);
    commit({ ...draft, bags }, 'bags', 'Model duplicated - edit it before saving.', 'info');
  }

  function deleteBag(index: number) {
    if (!draft) return;
    const bag = draft.bags[index];
    if (!bag) return;
    if (!confirm('Remove ' + (bag.name || 'this model') + ' from the catalogue? Use the “In use” box instead if you only want to hide it.')) return;
    const bags = draft.bags.slice();
    bags.splice(index, 1);
    const next = { ...draft, bags };
    if (!bags.length) {
      showToast('A rate card needs at least one model.', 'warn');
      addBagFrom(next, 'Model added - fill in its name and base cost.');
      return;
    }
    commit(next, 'bags');
  }

  function onTierAction(action: string, index: number) {
    if (action === 'del-tier') deleteTier(index);
  }

  function onBagAction(action: string, index: number) {
    if (action === 'del-bag') deleteBag(index);
    else if (action === 'dup-bag') duplicateBag(index);
  }

  /* ---------- cell edits (legacy apply*Input) ---------- */
  function onTierInput(index: number, field: string, value: string) {
    if (!draft) return;
    const tiers = draft.tiers.map((t) => ({ ...t }));
    const tier = tiers[index];
    if (!tier) return;
    if (field === 'min') tier.min = Math.max(1, Math.floor(numv(value, tier.min)));
    else if (field === 'max') tier.max = value === '' ? null : Math.max(1, Math.floor(numv(value, 0)));
    else if (field === 'markupPct') tier.markup = Math.max(0, numv(value, 0) / 100);
    edit({ ...draft, tiers });
  }

  function onBagInput(index: number, field: string, value: string, checked?: boolean) {
    if (!draft) return;
    const bags = draft.bags.map((b) => ({ ...b }));
    const bag = bags[index];
    if (!bag) return;
    if (field === 'active') bag.active = !!checked;
    else if (field === 'markupPct') bag.markup = String(value).trim() === '' ? null : Math.max(0, numv(value, 0) / 100);
    else if (['width', 'height', 'gusset', 'minQty', 'cost'].indexOf(field) !== -1) (bag as any)[field] = numv(value, 0);
    else (bag as any)[field] = value;
    edit({ ...draft, bags });
  }

  function onSettingInput(key: string, value: string, checked?: boolean) {
    if (!draft) return;
    const settings = { ...draft.settings } as any;
    if (key === 'allowManualMarkup') settings[key] = !!checked;
    else if (key === 'minOrderQty' || key === 'defaultValidityDays') settings[key] = Math.floor(numv(value, settings[key]));
    else settings[key] = value;
    edit({ ...draft, settings });
  }

  /* legacy: the filter box only re-rendered #bag-rows, the preview box only #tier-rows */
  function changeFilter(value: string) {
    setFilter(value);
    setBagGen((g) => g + 1);
  }

  function changePreviewBag(id: string) {
    setPreviewBagId(id);
    setTierGen((g) => g + 1);
  }

  /* ---------- derived view state (legacy render*) ---------- */
  const badBag = useMemo(() => {
    const out: Record<string, boolean> = {};
    errors.forEach((e) => {
      if (e.level === 'warn') return;
      if (e.scope === 'bags' && e.index != null && e.field) out[e.index + ':' + e.field] = true;
    });
    return out;
  }, [errors]);

  const badTier = useMemo(() => {
    const out: Record<string, boolean> = {};
    errors.forEach((e) => {
      if (e.level === 'warn') return;
      if (e.scope === 'tiers' && e.index != null && e.field) out[e.index + ':' + e.field] = true;
    });
    return out;
  }, [errors]);

  const badSet = useMemo(() => {
    const out: Record<string, boolean> = {};
    errors.forEach((e) => {
      if (e.level === 'warn') return;
      if (e.scope === 'settings' && e.field) out[e.field] = true;
    });
    return out;
  }, [errors]);

  const tiers = draft ? draft.tiers : [];
  const bags = draft ? draft.bags : [];
  const mid = draft ? midBand(tiers) : null;
  const low = draft ? lowBand(tiers) : null;
  const midQty = mid ? mid.min : 0;
  const previewBag = draft
    ? (draft.bags.find((b) => b.id === previewBagId) || draft.bags.filter((b) => b.active)[0] || draft.bags[0] || null)
    : null;

  const bagEff = (bag: Bag) => pctText(markupFor(bag, midQty, tiers));
  const bagRate = (bag: Bag) => lkr(priceFor(bag, midQty, tiers));
  const bagLow = (bag: Bag) => lkr(priceFor(bag, low ? low.min : midQty, tiers));

  /* legacy renderTierTable() prices the bands for the model in the preview box */
  const previewCost = previewBag ? numv(previewBag.cost, 0) : 0;
  const tierMult = (tier: Tier) => '×' + (1 + tier.markup).toFixed(2);
  const tierPrice = (tier: Tier) =>
    previewCost * (1 + (previewBag && previewBag.markup != null ? previewBag.markup : tier.markup));
  const tierProfit = (tier: Tier) => tierPrice(tier) - previewCost;

  const needle = String(filter || '').trim().toLowerCase();
  const visibleBags = bags
    .map((bag, index) => ({ bag, index }))
    .filter(({ bag }) => !needle
      || (bag.name + ' ' + bag.ref + ' ' + bag.category + ' ' + bag.gsm).toLowerCase().indexOf(needle) !== -1);

  const lockSourceText = source === 'server'
    ? 'The rate card currently served by this local server (catalog.json) will be edited.'
    : (source === 'browser'
      ? 'The rate card saved in this browser will be edited - no server copy was found.'
      : 'No saved rate card yet: the factory defaults will be edited.');

  return {
    unlocked,
    lockScreenClass: 'card p-6 max-w-lg mx-auto space-y-4' + (unlocked ? ' hidden' : ''),
    dashboardClass: 'space-y-5' + (unlocked ? '' : ' hidden'),
    lockButtonClass: 'btn-outline' + (unlocked ? '' : ' hidden'),
    lockMessage,
    lockSourceClass: 'note ' + (rates && source === 'factory' ? 'note-warn' : 'note-info'),
    lockSource: (
      <>
        <i className="fa-solid fa-database mt-px"></i>
        <span>{rates
          ? lockSourceText + ' Last saved: ' + fmtDateTime(rates.updatedAt) + '.'
          : 'Loading the current rate card…'}</span>
      </>
    ),
    password,
    onPasswordChange: setPassword,
    passwordRef,
    onUnlock: attemptUnlock,

    toastClass: 'toast toast-' + toastKind + (toastHidden ? ' toast-hidden' : ''),
    toastIconClass: toastShown ? TOAST_ICONS[toastKind] + ' text-base' : 'fa-solid fa-circle-check',
    toastText,

    pillDirtyClass: 'tag ' + (dirty ? 'tag-warn' : 'tag-ok'),
    pillDirty: dirty
      ? <><i className="fa-solid fa-pen"></i> Unsaved changes</>
      : <><i className="fa-solid fa-circle-check"></i> All changes saved</>,
    pillSourceClass: 'tag ' + (!draft ? 'tag-info' : (source === 'server' ? 'tag-ok' : (source === 'browser' ? 'tag-info' : 'tag-warn'))),
    pillSource: !draft
      ? '—'
      : (source === 'server'
        ? 'loaded from the local server'
        : (source === 'browser' ? 'loaded from this browser' : 'factory defaults')),
    pillUpdated: !draft ? '—' : 'last saved: ' + fmtDateTime(rates ? rates.updatedAt : null),
    source,

    saveLocal,
    onToggleSaveLocal: setSaveLocal,
    saveServer: serverChecked,
    onToggleSaveServer: setSaveServer,
    serverDisabled: !hasServer,
    serverTitle: hasServer
      ? 'Store the rate card in catalog.json through serve.js'
      : 'Only available when the page is opened from the local server',
    canSave: dirty,
    saveBarClass: 'fixed bottom-0 left-0 right-0 z-40 bg-emerald-950/95 backdrop-blur border-t border-emerald-800 px-4 py-2.5' + (dirty ? '' : ' hidden'),
    saveBarText: dirty ? 'Unsaved changes - save them so the calculator picks them up' : 'Unsaved changes',
    onSave: saveChanges,
    onRevert: revertDraft,
    onLock: () => lockPanel('Locked.'),
    onExport: exportJson,
    saveMessageClass: saveMessage ? 'pt-3' : 'pt-3 hidden',
    saveMessage,

    errorBoxClass: errors.length ? 'pt-3 space-y-1.5' : 'pt-3 hidden',
    errors,
    badBag,
    badTier,
    badSet,

    draftReady: draft !== null,
    tiers,
    midQty,
    tierMult,
    tierPrice,
    tierProfit,
    thMid: draft && mid ? 'Rate @ ' + bandShort(mid) : 'Rate / bag',
    thLow: draft && low ? 'Lowest @ ' + bandShort(low) : 'Lowest rate',
    onTierInput,
    onTierAction,
    onAddTier: addTier,
    onTidyTiers: tidyTiers,
    tierGen,

    bags,
    visibleBags,
    filter,
    onFilterChange: changeFilter,
    bagTotal: draft ? bags.filter((b) => b.active).length + ' of ' + bags.length + ' models in use' : '—',
    bagEff,
    bagRate,
    bagLow,
    onBagInput,
    onBagAction,
    onAddBag: addBag,
    bagGen,

    settings: draft ? draft.settings : null,
    onSettingInput,

    previewOptions,
    previewValue: previewBag ? previewBag.id : '',
    onPreviewChange: changePreviewBag,

    pwCurrent,
    pwNew,
    pwConfirm,
    onPwCurrentChange: setPwCurrent,
    onPwNewChange: setPwNew,
    onPwConfirmChange: setPwConfirm,
    pwMessageClass: pwMessage ? '' : 'hidden',
    pwMessage,
    onChangePassword: changePassword,

    importText,
    onImportTextChange: setImportText,
    onImportText: importFromText,
    onImportFile: importFromFile,
    onReset: resetToFactory,

    log: draft ? draft.log.slice().reverse() : [],
  };
}







