/* AUTO-GENERATED from _baseline/admin.body.html by _baseline/mkjsx.mjs.
   This is the legacy markup, mechanically converted to JSX, split into real components below.
   The ids the legacy script wrote into are wired to useAdminPanel() by _baseline/patch-admin.mjs;
   every other byte of markup and wording is still the legacy markup. */

import { ErrorNotes, BagRows, LogRows, NoteBox, TierRows } from './admin/AdminTables.tsx';
import { useAdminPanel } from './admin/useAdminPanel.tsx';

export function Admin() {
  const a = useAdminPanel();
  /* legacy markBadCells() rings a settings cell when the validator flags it */
  const setCls = (base: string, key: string) => base + (a.badSet[key] ? ' cell-bad' : '');
  return (
    <>
<header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-emerald-100 shadow-sm">
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-tr from-emerald-800 via-emerald-600 to-lime-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/25">
                <i className="fa-solid fa-user-shield"></i>
            </div>
            <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 truncate">Rate&nbsp;control</h1>
                <p className="text-[11px] text-slate-500 truncate">Bag costs, percentage markups and quotation defaults · administrator only</p>
            </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
            <a href="./" className="btn-outline" title="Open the price calculator"><i className="fa-solid fa-calculator text-emerald-600"></i><span className="hidden sm:inline">Calculator</span></a>
            <button type="button" id="btn-lock" className={a.lockButtonClass} onClick={a.onLock}><i className="fa-solid fa-lock text-emerald-600"></i><span className="hidden sm:inline">Lock</span></button>
        </div>
    </div>
</header>

<main className="max-w-7xl mx-auto px-4 lg:px-6 py-5 space-y-5 pb-32">

    {/* ============ LOCK SCREEN ============ */}
    <section id="lock-screen" className={a.lockScreenClass}>
        <div className="text-center space-y-1">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-950 text-lime-400 flex items-center justify-center text-lg"><i className="fa-solid fa-lock"></i></div>
            <h2 className="text-lg font-extrabold text-slate-900">Administrator sign-in</h2>
            <p className="text-xs text-slate-500">Bag costs and markup percentages are privileged information. Enter the administrator password to open the rate control panel.</p>
        </div>
        <div>
            <label className="label" htmlFor="admin-password">Password</label>
            <div className="flex gap-2">
                <input id="admin-password" className="field mono" type="password" autoComplete="current-password" placeholder="••••••••" aria-describedby="lock-message" ref={a.passwordRef} value={a.password} onChange={(e) => a.onPasswordChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') a.onUnlock(); }} />
                <button type="button" id="btn-unlock" className="btn-primary px-4 shrink-0" onClick={a.onUnlock}><i className="fa-solid fa-unlock"></i> Unlock</button>
            </div>
        </div>
        <p id="lock-message" className="hint">{a.lockMessage && (<><i className={a.lockMessage.icon}></i><span>{a.lockMessage.text}</span></>)}</p>
        <div id="lock-source" className={a.lockSourceClass}>{a.lockSource}</div>
        <details className="text-[11px] text-slate-500">
            <summary className="cursor-pointer font-semibold text-slate-600">Password help</summary>
            <div className="pt-2 space-y-1.5">
                <p>The panel uses <strong>one administrator password</strong>, kept as a one-way hash inside the rate card. The factory password is <span className="mono font-bold">mhs-admin</span> — change it under <strong>Security</strong> as soon as you sign in.</p>
                <p><strong>Forgot it?</strong> Delete <span className="mono">catalog.json</span> next to <span className="mono">serve.js</span> (or clear this site's browser storage) and the factory password works again.</p>
                <p className="text-slate-400">This sign-in keeps the numbers off the screen for casual users. It is not encryption — anyone who can read the files on this PC can read the rate card.</p>
            </div>
        </details>
    </section>
    {/* ============ DASHBOARD ============ */}
    <div id="dashboard" className={a.dashboardClass}>

        {/* status strip */}
        <section className="card p-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span id="pill-dirty" className={a.pillDirtyClass}>{a.pillDirty}</span>
                    <span id="pill-source" className={a.pillSourceClass}>{a.pillSource}</span>
                    <span id="pill-updated" className="tag tag-info">{a.pillUpdated}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"><input id="opt-local" type="checkbox" checked={a.saveLocal} className="accent-emerald-600" onChange={(e) => a.onToggleSaveLocal(e.target.checked)} /> save in this browser</label>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"><input id="opt-server" type="checkbox" checked={a.saveServer} disabled={a.serverDisabled} title={a.serverTitle} className="accent-emerald-600" onChange={(e) => a.onToggleSaveServer(e.target.checked)} /> publish to the local server</label>
                    <button type="button" id="btn-revert" className="btn-dark" disabled={!a.canSave} onClick={a.onRevert}><i className="fa-solid fa-rotate-left"></i> Revert</button>
                    <button type="button" id="btn-save-top" className="btn-primary" disabled={!a.canSave} onClick={a.onSave}><i className="fa-solid fa-floppy-disk"></i> Save changes</button>
                </div>
            </div>
            <div id="save-message" className={a.saveMessageClass}>{a.saveMessage && <NoteBox note={a.saveMessage} />}</div>
            <div id="error-box" className={a.errorBoxClass}><ErrorNotes panel={a} /></div>
        </section>

        {/* 1 · markup tiers */}
        <section className="card">
            <div className="card-head">
                <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2"><span className="step-num">1</span> Quantity markup tiers</h2>
                    <p className="text-[11px] text-slate-500 mt-1.5 max-w-2xl">The percentage added to the bag cost for each order size band. The calculator picks the band from the order quantity and never shows these numbers to the customer.</p>
                </div>
                <div className="text-right shrink-0">
                    <label className="label mb-1" htmlFor="preview-bag">Preview prices for</label>
                    <select id="preview-bag" className="field py-1.5 text-xs" value={a.previewValue} onChange={(e) => a.onPreviewChange(e.target.value)}>
                        {a.previewOptions.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
                    </select>
                </div>
            </div>
            <div className="scroll-x" style={{ maxHeight: '22rem' }}>
                <table className="tbl">
                    <thead>
                        <tr>
                            <th className="num">From qty</th>
                            <th className="num">To qty</th>
                            <th className="num">Markup %</th>
                            <th className="num">Multiplier</th>
                            <th className="num">Price / bag</th>
                            <th className="num">Profit / bag</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="tier-rows"><TierRows panel={a} /></tbody>
                </table>
            </div>
            <div className="px-5 py-3 border-t border-emerald-50 flex flex-wrap items-center gap-2">
                <button type="button" id="btn-add-tier" className="btn-outline" onClick={a.onAddTier}><i className="fa-solid fa-plus"></i> Add a tier</button>
                <button type="button" id="btn-tidy-tiers" className="btn-outline" onClick={a.onTidyTiers}><i className="fa-solid fa-wand-magic-sparkles"></i> Make bands continuous</button>
                <span className="hint"><i className="fa-solid fa-circle-info mt-px"></i><span>Prices and profit use the preview bag above. The last band always runs to “and above”.</span></span>
            </div>
        </section>
        {/* 2 · bag catalogue */}
        <section className="card">
            <div className="card-head">
                <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2"><span className="step-num">2</span> Bag catalogue, costs and per-model rates</h2>
                    <p className="text-[11px] text-slate-500 mt-1.5 max-w-2xl">One row per non-woven model. The <strong>base cost</strong> is the factory cost per bag; the calculator adds the tier markup on top. Turn a model off to hide it from the calculator without losing its numbers.</p>
                </div>
                <div className="flex items-end gap-2 shrink-0">
                    <div>
                        <label className="label mb-1" htmlFor="bag-filter">Filter</label>
                        <input id="bag-filter" className="field py-1.5 text-xs" type="search" placeholder="name, reference or type" value={a.filter} onChange={(e) => a.onFilterChange(e.target.value)} />
                    </div>
                    <button type="button" id="btn-add-bag" className="btn-outline" onClick={a.onAddBag}><i className="fa-solid fa-plus"></i> Add a model</button>
                </div>
            </div>
            <div className="scroll-x" style={{ maxHeight: '34rem' }}>
                <table className="tbl">
                    <thead>
                        <tr>
                            <th>Model</th>
                            <th>Type</th>
                            <th>Reference / use case</th>
                            <th>GSM</th>
                            <th className="num">Width</th>
                            <th className="num">Height</th>
                            <th className="num">Gusset</th>
                            <th className="num">Min order</th>
                            <th className="num">Base cost (Rs)</th>
                            <th className="num">Override %</th>
                            <th className="num">Effective %</th>
                            <th className="num" id="th-rate-mid">{a.thMid}</th>
                            <th className="num" id="th-rate-low">{a.thLow}</th>
                            <th className="center">In&nbsp;use</th>
                            <th className="center">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="bag-rows"><BagRows panel={a} /></tbody>
                </table>
            </div>
            <div className="px-5 py-3 border-t border-emerald-50 flex flex-wrap items-center justify-between gap-2">
                <span className="hint max-w-2xl"><i className="fa-solid fa-circle-info mt-px"></i><span>Sizes are in cm (W×H×G). Leave <strong>Override %</strong> empty to use the tier markups; type a value only when a model needs its own rate. “Effective %” and the two rate columns show what a customer sees.</span></span>
                <span id="bag-total" className="tag tag-info">{a.bagTotal}</span>
            </div>
        </section>
        {/* 3 · quotation defaults */}
        <section className="card">
            <div className="card-head">
                <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2"><span className="step-num">3</span> Quotation defaults and staff permissions</h2>
                    <p className="text-[11px] text-slate-500 mt-1.5 max-w-2xl">These values pre-fill the calculator and appear on the printed / copied quotation.</p>
                </div>
            </div>
            <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                    <label className="label" htmlFor="set-company">Company name</label>
                    <input id="set-company" className={setCls('field', 'companyName')} data-set="companyName" value={a.settings ? a.settings.companyName : ''} onChange={(e) => a.onSettingInput('companyName', e.target.value)} />
                </div>
                <div>
                    <label className="label" htmlFor="set-tagline">Strapline</label>
                    <input id="set-tagline" className={setCls('field', 'companyTagline')} data-set="companyTagline" value={a.settings ? a.settings.companyTagline : ''} onChange={(e) => a.onSettingInput('companyTagline', e.target.value)} />
                </div>
                <div>
                    <label className="label" htmlFor="set-minorder">Catalogue minimum order (bags)</label>
                    <input id="set-minorder" className={setCls('field mono', 'minOrderQty')} type="number" min="1" step="1" data-set="minOrderQty" value={a.settings ? String(a.settings.minOrderQty) : ''} onChange={(e) => a.onSettingInput('minOrderQty', e.target.value)} />
                </div>
                <div>
                    <label className="label" htmlFor="set-validity">Quotation valid for (days)</label>
                    <input id="set-validity" className={setCls('field mono', 'defaultValidityDays')} type="number" min="1" max="365" step="1" data-set="defaultValidityDays" value={a.settings ? String(a.settings.defaultValidityDays) : ''} onChange={(e) => a.onSettingInput('defaultValidityDays', e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                    <label className="label" htmlFor="set-lead">Production lead time</label>
                    <input id="set-lead" className={setCls('field', 'defaultLeadTime')} data-set="defaultLeadTime" value={a.settings ? a.settings.defaultLeadTime : ''} onChange={(e) => a.onSettingInput('defaultLeadTime', e.target.value)} />
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                    <label className="label" htmlFor="set-notes">Default note / terms on every quotation</label>
                    <textarea id="set-notes" className={setCls('field', 'defaultNotes')} rows={2} data-set="defaultNotes" value={a.settings ? a.settings.defaultNotes : ''} onChange={(e) => a.onSettingInput('defaultNotes', e.target.value)} placeholder="e.g. Prices exclude delivery. 50% advance payment with the order."></textarea>
                </div>
            </div>
            <div className="px-5 pb-5">
                <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 cursor-pointer">
                    <input id="set-allow-manual" type="checkbox" className="mt-0.5 accent-emerald-600" checked={a.settings ? a.settings.allowManualMarkup : false} onChange={(e) => a.onSettingInput('allowManualMarkup', '', e.target.checked)} />
                    <span className="text-[12px] leading-relaxed text-amber-900">
                        <strong>Allow trusted staff to override the markup on the calculator page.</strong>
                        This reveals the markup selector and the manual % box inside the calculator. Anyone who can set the markup to 0 can work out the bag cost, so leave it off unless a manager needs it.
                    </span>
                </label>
            </div>
        </section>

        {/* 4 · password */}
        <section className="card">
            <div className="card-head">
                <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2"><span className="step-num">4</span> Administrator password</h2>
                    <p className="text-[11px] text-slate-500 mt-1.5 max-w-2xl">The password locks this panel and authorises every save sent to <span className="mono">serve.js</span>. Changing it also re-signs future publishes, so do it while you are signed in.</p>
                </div>
            </div>
            <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div>
                    <label className="label" htmlFor="pw-current">Current password</label>
                    <input id="pw-current" className="field mono" type="password" autoComplete="current-password" value={a.pwCurrent} onChange={(e) => a.onPwCurrentChange(e.target.value)} />
                </div>
                <div>
                    <label className="label" htmlFor="pw-new">New password</label>
                    <input id="pw-new" className="field mono" type="password" autoComplete="new-password" value={a.pwNew} onChange={(e) => a.onPwNewChange(e.target.value)} />
                </div>
                <div>
                    <label className="label" htmlFor="pw-confirm">Repeat new password</label>
                    <input id="pw-confirm" className="field mono" type="password" autoComplete="new-password" value={a.pwConfirm} onChange={(e) => a.onPwConfirmChange(e.target.value)} />
                </div>
                <div>
                    <button type="button" id="btn-change-pw" className="btn-dark w-full" onClick={a.onChangePassword}><i className="fa-solid fa-key"></i> Change password</button>
                </div>
            </div>
            <div className="px-5 pb-5 space-y-2">
                <div id="pw-message" className={a.pwMessageClass}>{a.pwMessage && <NoteBox note={a.pwMessage} />}</div>
                <p className="hint"><i className="fa-solid fa-shield-halved mt-px"></i><span>Use at least 8 characters. The password is stored only as a hash, never as text — write it down somewhere safe, because it cannot be recovered from the file.</span></p>
            </div>
        </section>
        {/* 5 · backup & activity */}
        <section className="card">
            <div className="card-head">
                <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2"><span className="step-num">5</span> Backup, import and activity log</h2>
                    <p className="text-[11px] text-slate-500 mt-1.5 max-w-2xl">Keep an export of the rate card before a price change — it is the only way back to an earlier set of rates.</p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                    <button type="button" id="btn-export" className="btn-outline" onClick={a.onExport}><i className="fa-solid fa-file-arrow-down"></i> Export JSON</button>
                    <button type="button" id="btn-reset" className="btn-outline" style={{ color: '#b91c1c', borderColor: '#fecaca' }} onClick={a.onReset}><i className="fa-solid fa-arrows-rotate"></i> Reset to factory</button>
                </div>
            </div>
            <div className="p-5 grid lg:grid-cols-2 gap-5">
                <div className="space-y-2">
                    <label className="label" htmlFor="import-text">Import a rate card (paste JSON, or pick a file)</label>
                    <textarea id="import-text" className="field mono text-[11px]" rows={5} value={a.importText} onChange={(e) => a.onImportTextChange(e.target.value)} placeholder={"{\"schema\":1,\"tiers\":[…],\"bags\":[…]}"}></textarea>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" id="btn-import" className="btn-dark" onClick={a.onImportText}><i className="fa-solid fa-upload"></i> Import pasted JSON</button>
                        <input id="import-file" type="file" accept=".json,application/json" className="text-[11px] text-slate-500" onChange={(e) => a.onImportFile(e.target.files && e.target.files.length ? e.target.files[0] : null)} />
                    </div>
                    <p className="hint"><i className="fa-solid fa-triangle-exclamation mt-px text-amber-500"></i><span>Import replaces the whole rate card (tiers, models, settings and password hash). You still have to press <strong>Save changes</strong> afterwards.</span></p>
                </div>
                <div className="space-y-2">
                    <p className="label mb-0">How saving works</p>
                    <ul className="text-[11px] text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                        <li><strong>Save in this browser</strong> writes the rate card to this browser's storage. It works even when the calculator is opened by double-clicking the file.</li>
                        <li><strong>Publish to the local server</strong> sends the same document to <span className="mono">PUT /api/rates</span>, which stores it in <span className="mono">catalog.json</span> in this folder. Everybody who opens the calculator from <span className="mono">localhost</span> then sees the new rates.</li>
                        <li>The calculator always prefers the newest copy (server and browser copies are compared by their timestamp).</li>
                        <li>Saving needs the network API, so keep <span className="mono">node serve.js</span> running. If publishing fails, the browser copy is still saved.</li>
                    </ul>
                </div>
            </div>
            <div className="px-5 pb-5 space-y-2">
                <p className="label mb-0">Activity log — the last 40 saved changes</p>
                <div className="scroll-x rounded-xl border border-emerald-100" style={{ maxHeight: '16rem' }}>
                    <table className="tbl">
                        <thead>
                            <tr><th>When</th><th>Change</th><th>Detail</th></tr>
                        </thead>
                        <tbody id="log-rows"><LogRows panel={a} /></tbody>
                    </table>
                </div>
            </div>
        </section>

        <p className="text-center text-[11px] text-slate-400 pb-2">
            Administrator panel · the calculator itself lives at
            <a href="./" className="font-semibold text-emerald-700 underline">the calculator page</a>.
        </p>
    </div>
</main>

{/* sticky save bar */}
<div id="save-bar" className={a.saveBarClass}>
    <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <span id="save-bar-text" className="text-[11px] font-semibold text-lime-300">{a.saveBarText}</span>
        <div className="flex items-center gap-2">
            <button type="button" id="btn-revert-2" className="btn-outline" onClick={a.onRevert}><i className="fa-solid fa-rotate-left"></i> Revert</button>
            <button type="button" id="btn-save" className="btn-primary" disabled={!a.canSave} onClick={a.onSave}><i className="fa-solid fa-floppy-disk"></i> Save changes</button>
        </div>
    </div>
</div>

{/* toast */}
<div id="toast" className={a.toastClass} role="status" aria-live="polite">
    <i id="toast-icon" className={a.toastIconClass}></i>
    <span id="toast-text">{a.toastText}</span>
</div>
    </>
  );
}
