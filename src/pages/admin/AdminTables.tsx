/* The dashboard's three tables and its note boxes. The legacy script built every row with
   innerHTML, so the markup here is the same HTML with the values interpolated - the row
   components only map state onto those exact cells. */
import { CATEGORIES, fmtDateTime, pctInputValue } from '../../core/admin.ts';
import { lkr } from '../../core/format.ts';
import type { AdminPanel, Note } from './useAdminPanel.tsx';

/** One `note` box (save-message, pw-message, the error list). */
export function NoteBox({ note }: { note: Note }) {
  return (
    <div className={'note note-' + note.kind}>
      <i className={'fa-solid ' + note.icon}></i>
      <span>{note.content}</span>
    </div>
  );
}

/** legacy renderErrors(): the problems first, then the warnings, or the all-clear note. */
export function ErrorNotes({ panel }: { panel: AdminPanel }) {
  const bad = panel.errors.filter((e) => e.level !== 'warn');
  const warn = panel.errors.filter((e) => e.level === 'warn');
  if (!panel.errors.length) return null;
  return (
    <>
      {bad.length > 0 && (
        <div className="note note-bad">
          <i className="fa-solid fa-circle-exclamation mt-px"></i>
          <span>
            <strong>{bad.length} problem{bad.length > 1 ? 's' : ''} to fix before saving:</strong>{' '}
            {bad.map((e) => e.message).join(' ')}
          </span>
        </div>
      )}
      {warn.length > 0 && (
        <div className="note note-warn">
          <i className="fa-solid fa-triangle-exclamation mt-px"></i>
          <span>
            <strong>{warn.length} warning{warn.length > 1 ? 's' : ''}:</strong>{' '}
            {warn.map((e) => e.message).join(' ')}
          </span>
        </div>
      )}
      {bad.length === 0 && (
        <div className="note note-ok">
          <i className="fa-solid fa-circle-check mt-px"></i>
          <span>Everything checks out - you can save.</span>
        </div>
      )}
    </>
  );
}

/** legacy markBadCells(): the cell-bad ring follows the draft, warn-level notes never mark. */
function withBad(base: string, map: Record<string, boolean>, key: string): string {
  return base + (map[key] ? ' cell-bad' : '');
}

/** legacy renderTierTable(). The inputs are deliberately uncontrolled: the legacy page only put the
 *  draft value back into a cell when it rebuilt the tbody, so text you typed stayed on screen even
 *  when the draft coerced it (99.99 -> 99). `tierGen` remounts the rows exactly when the legacy
 *  rebuilt them. */
export function TierRows({ panel }: { panel: AdminPanel }) {
  return (
    <>
      {panel.tiers.length > 0 && panel.tiers.map((t, i) => (
        <tr key={panel.tierGen + ':' + i}>
          <td className="num">
            <input className={withBad('field-sm mono', panel.badTier, i + ':min')} type="number" min={1} step={1}
              data-scope="tier" data-i={i} data-field="min" defaultValue={t.min}
              aria-label={'Band ' + (i + 1) + ' from quantity'} style={{ minWidth: '5rem' }}
              onChange={(e) => panel.onTierInput(i, 'min', e.target.value)} />
          </td>
          <td className="num">
            {t.max == null
              ? <span className="tag tag-lime">and above</span>
              : <input className={withBad('field-sm mono', panel.badTier, i + ':max')} type="number" min={1} step={1}
                  data-scope="tier" data-i={i} data-field="max" defaultValue={t.max}
                  aria-label={'Band ' + (i + 1) + ' to quantity'} style={{ minWidth: '5rem' }}
                  onChange={(e) => panel.onTierInput(i, 'max', e.target.value)} />}
          </td>
          <td className="num whitespace-nowrap">
            {/* the legacy validator reports "markup" while this cell is data-field="markupPct", so it
                is never ringed - the same as the legacy page */}
            <input className={withBad('field-sm mono', panel.badTier, i + ':markupPct')} type="number" min={0} step={0.5}
              data-scope="tier" data-i={i} data-field="markupPct" defaultValue={pctInputValue(t.markup)}
              aria-label={'Band ' + (i + 1) + ' markup percentage'} style={{ minWidth: '4.5rem' }}
              onChange={(e) => panel.onTierInput(i, 'markupPct', e.target.value)} />
            <span className="t-muted text-[10px] ml-0.5">%</span>
          </td>
          <td className="num t-accent" data-derive={'mult-' + i}>{panel.tierMult(t)}</td>
          <td className="num t-price mono" data-derive={'price-' + i}>{lkr(panel.tierPrice(t))}</td>
          <td className="num t-muted mono" data-derive={'profit-' + i}>{lkr(panel.tierProfit(t))}</td>
          <td className="center">
            <button type="button" className="btn-tiny danger" data-action="del-tier" data-i={i} title="Remove this band"
              onClick={() => panel.onTierAction('del-tier', i)}><i className="fa-solid fa-trash-can"></i></button>
          </td>
        </tr>
      ))}
      {panel.tiers.length === 0 && panel.draftReady && (
        <tr><td colSpan={7} className="center t-muted">No bands yet - add one to start.</td></tr>
      )}
    </>
  );
}
/** One numeric bag cell (legacy renderBags()'s cell() helper). Uncontrolled for the same reason as
 *  the tier cells - `bagGen` decides when the draft value goes back into the box. */
function BagCell({ panel, index, field, value, min, step, width }: {
  panel: AdminPanel; index: number; field: string; value: number | string;
  min: string; step: string; width: string;
}) {
  return (
    <input className={withBad('field-sm mono num', panel.badBag, index + ':' + field)} type="number" min={min} step={step}
      style={{ minWidth: width }} data-scope="bag" data-i={index} data-field={field} defaultValue={value}
      onChange={(e) => panel.onBagInput(index, field, e.target.value)} />
  );
}

/** legacy renderBags(): one row per model that passes the filter box. */
export function BagRows({ panel }: { panel: AdminPanel }) {
  return (
    <>
      {panel.visibleBags.length > 0 && panel.visibleBags.map(({ bag: b, index: i }) => (
        <tr key={panel.bagGen + ':' + i} className={b.active ? '' : 'row-off'}>
          <td>
            <input className={withBad('field-sm', panel.badBag, i + ':name')} data-scope="bag" data-i={i} data-field="name"
              defaultValue={b.name} style={{ minWidth: '11rem' }}
              onChange={(e) => panel.onBagInput(i, 'name', e.target.value)} />
          </td>
          <td>
            <select className={withBad('field-sm', panel.badBag, i + ':category')} data-scope="bag" data-i={i} data-field="category"
              value={b.category} style={{ minWidth: '7rem' }}
              onChange={(e) => panel.onBagInput(i, 'category', e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              {CATEGORIES.indexOf(b.category) === -1 && <option value={b.category}>{b.category}</option>}
            </select>
          </td>
          <td>
            <input className={withBad('field-sm', panel.badBag, i + ':ref')} data-scope="bag" data-i={i} data-field="ref"
              defaultValue={b.ref} style={{ minWidth: '9rem' }}
              onChange={(e) => panel.onBagInput(i, 'ref', e.target.value)} />
          </td>
          <td>
            <input className={withBad('field-sm', panel.badBag, i + ':gsm')} data-scope="bag" data-i={i} data-field="gsm"
              defaultValue={b.gsm} style={{ minWidth: '4rem' }}
              onChange={(e) => panel.onBagInput(i, 'gsm', e.target.value)} />
          </td>
          <td className="num"><BagCell panel={panel} index={i} field="width" value={b.width} min="0" step="0.5" width="3.4rem" /></td>
          <td className="num"><BagCell panel={panel} index={i} field="height" value={b.height} min="0" step="0.5" width="3.4rem" /></td>
          <td className="num"><BagCell panel={panel} index={i} field="gusset" value={b.gusset} min="0" step="0.5" width="3.4rem" /></td>
          <td className="num"><BagCell panel={panel} index={i} field="minQty" value={b.minQty} min="1" step="50" width="4rem" /></td>
          <td className="num"><BagCell panel={panel} index={i} field="cost" value={b.cost} min="0" step="0.01" width="4.8rem" /></td>
          <td className="num">
            <input className={withBad('field-sm mono num', panel.badBag, i + ':markupPct')} type="number" min={0} step={0.5}
              placeholder="tier" style={{ minWidth: '4rem' }} data-scope="bag" data-i={i} data-field="markupPct"
              defaultValue={b.markup == null ? '' : pctInputValue(b.markup)}
              onChange={(e) => panel.onBagInput(i, 'markupPct', e.target.value)} />
          </td>
          <td className="num t-accent" data-derive={'eff-' + i}>{panel.bagEff(b)}</td>
          <td className="num t-price mono" data-derive={'rate-' + i}>{panel.bagRate(b)}</td>
          <td className="num t-muted mono" data-derive={'low-' + i}>{panel.bagLow(b)}</td>
          <td className="center">
            <input type="checkbox" className="accent-emerald-600" data-scope="bag" data-i={i} data-field="active"
              defaultChecked={b.active} aria-label={b.name + ' in use'}
              onChange={(e) => panel.onBagInput(i, 'active', '', e.target.checked)} />
          </td>
          <td className="center whitespace-nowrap">
            <button type="button" className="btn-tiny" data-action="dup-bag" data-i={i} title="Duplicate this model"
              onClick={() => panel.onBagAction('dup-bag', i)}><i className="fa-regular fa-copy"></i></button>{' '}
            <button type="button" className="btn-tiny danger" data-action="del-bag" data-i={i} title="Remove this model"
              onClick={() => panel.onBagAction('del-bag', i)}><i className="fa-solid fa-trash-can"></i></button>
          </td>
        </tr>
      ))}
      {panel.visibleBags.length === 0 && panel.draftReady && (
        <tr><td colSpan={15} className="center t-muted">No model matches that filter.</td></tr>
      )}
    </>
  );
}

/** legacy renderLog(): newest entry first. */
export function LogRows({ panel }: { panel: AdminPanel }) {
  return (
    <>
      {panel.log.length > 0 && panel.log.map((entry, i) => (
        <tr key={i}>
          <td className="t-muted whitespace-nowrap">{fmtDateTime(entry.at)}</td>
          <td className="t-strong">{entry.action || ''}</td>
          <td className="t-muted">{entry.detail || ''}</td>
        </tr>
      ))}
      {panel.log.length === 0 && panel.draftReady && (
        <tr><td colSpan={3} className="center t-muted">Nothing has been saved yet.</td></tr>
      )}
    </>
  );
}
