/* Golden-parity harness: drives the legacy page and the React page through the same script and
   compares every element that carries an id, plus the generated tables and the print sheet.
   Usage: node _baseline/parity.mjs [--page=calculator|admin] [--shots] [--lines=N] [--report=NAME]
   Exits non-zero when a difference is found (see _baseline/verify.mjs for both pages at once). */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const BASE = 'http://127.0.0.1:8080';
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const PAGES = { calculator: ['/calculator', '/legacy/bagpricecalculator%20v2.html'], admin: ['/admin', '/legacy/admin.html'] };

const NORM_REF = /MHS-\d{6}-\d{3}/g;

/* Reads every id once. Split out of snapshot() so the same reading can be repeated until it stops
   changing. */
const readBody = () => {
    /* A synthetic click scrolls its target into view, and the two pages need not be left at the
       same offset (neither page scrolls itself, and nothing here reacts to scrolling). Measuring
       from a fixed scroll position makes the viewport anchored parts comparable as well - the
       save bar, the toast bar and the floating lock button all sit at a viewport edge. */
    window.scrollTo(0, 0);
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    /* display:none on an ancestor hides the subtree, so walk the chain */
    const isHidden = (el) => {
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden === true) return true;
      }
      return false;
    };
    const ids = {};
    /* ---- the bag preview panel, the one part of the page the port deliberately redesigned -------
       The legacy panel wraps a Three.js canvas and carries a "Reset view" button, a Hide/Show
       toggle, a WebGL spinner and a drag hint. The port shows the factory reference photo of the
       selected model under the title "Bag preview" instead, so all of that is gone and the panel is
       a few lines shorter. Rather than teaching the whole harness to ignore the left column, the
       panel is measured instead of compared:
         - its own ids stay out of the id map (the two markups no longer match by design),
         - the elements inside it stay out of the visible counts,
         - everything the shorter panel pushes up below it in the same column is lined up again with
           the panel's own height delta (see diff()).
       Everything outside the panel is still compared name by name, box by box.
       It is found structurally because the two pages no longer share an id inside it: the first
       no-print section of the calculator's main column, which is how both pages nest it. */
    const panel = document.querySelector('main section.no-print');
    const column = panel ? panel.parentElement : null;
    /* the edges are kept unrounded: the redesign shifted the column by a fraction of a pixel */
    const panelBox = panel
      ? (() => {
          const r = panel.getBoundingClientRect();
          return [r.top + window.scrollY, r.bottom + window.scrollY];
        })()
      : null;
    document.querySelectorAll('[id]').forEach((el) => {
      if (panel && panel.contains(el)) return;   // the redesigned preview panel - see above
      const rect = el.getBoundingClientRect();
      const entry = {
        // innerText is layout aware: it collapses block boundaries the way the eye sees them
        text: norm(el.innerText === undefined ? el.textContent : el.innerText),
        cls: norm(el.className).split(' ').sort().join(' '),
        /* Document coordinates, not viewport ones. A synthetic click scrolls its target into view,
           and the two pages are not left at the same scroll offset (neither page scrolls on its
           own). Layout does not depend on the scroll position, so measuring from the top of the
           document keeps every real shift and drops that noise. */
        box: [Math.round(rect.x + window.scrollX), Math.round(rect.y + window.scrollY),
          Math.round(rect.width), Math.round(rect.height)].join(','),
      };
      if ('value' in el) entry.value = String(el.value);
      if (isHidden(el)) entry.hidden = true;
      /* An element below the preview panel in the same column moves with that panel: diff() takes
         the panel's height difference back out of its box, so the redesign is not reported as a
         layout difference in every id underneath it. Viewport-anchored elements (the save bar) are
         not part of that column and are compared as they are. */
      if (column && column.contains(el)) entry.afterPanel = true;
      ids[el.id] = entry;
    });
    const normHtml = (el) => (el ? el.innerHTML.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim() : '');
    const modalEl = document.getElementById('catalog-modal');
    const modalVisible = !!modalEl && !isHidden(modalEl);
    /* Every table below sits inside the admin dashboard. Locking the panel hides that whole
       subtree, and the legacy script leaves the last rendered rows in the DOM while the React page
       empties them - invisible either way, and unlocking renders both again. Same rule as the
       catalogue modal further down, so the tables are only compared while the dashboard is shown. */
    const dash = document.getElementById('dashboard');
    const dashHidden = !!dash && isHidden(dash);
    const plain = (tr) => tr.innerText.replace(/\s+/g, ' ').trim();
    const rows = (sel, map) => (dashHidden ? null : [...document.querySelectorAll(sel)].map(map));
    const flat = (sel, map) => (dashHidden ? null : [...document.querySelectorAll(sel)].map(map).join('|'));
    /* the elements the eye can see: anything inside a display:none / visibility:hidden / [hidden]
       subtree is off the page, and the two panels keep different things in such subtrees. The
       redesigned preview panel is left out as well - see above. */
    const visible = [...document.querySelectorAll('body *')]
      .filter((el) => !isHidden(el) && !(panel && panel.contains(el)));
    return {
      ids,
      /* the redesigned preview panel's own footprint, for the box realignment in diff() */
      panel: panelBox,
      tierRows: rows('#tier-rows tr', plain),
      /* the tier/bag cells are inputs, so innerText says nothing about them: keep the values too */
      tierInputs: flat('#tier-rows input', (el) => el.value),
      bagRows: rows('#bag-rows tr', plain),
      bagInputs: flat('#bag-rows input', (el) => (el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value)),
      /* legacy keeps an out-of-list category by appending an option, so compare the lists */
      bagCats: flat('#bag-rows select', (s) => s.value + ':' + [...s.options].map((o) => o.value).join(',')),
      logRows: rows('#log-rows tr', plain),
      previewOptions: rows('#preview-bag option', (o) => o.textContent),
      setValues: flat('[data-set]', (el) => (el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value)),
      /* only measured while the catalogue is on screen - the legacy modal keeps stale rows
         in the DOM while it is closed, which is invisible either way */
      modalRows: modalVisible
        ? [...document.querySelectorAll('#catalog-modal-table tr')].map(plain)
        : null,
      sheet: normHtml(document.getElementById('print-area')),
      bodyClass: norm(document.body.className).split(' ').sort().join(' '),
      /* Everything above is compared name by name, which cannot see an element that only one panel
         renders: a stray wrapper, a missing icon. Those carry no text of their own and often sit in
         a box that does not move. Count the elements the eye can see instead - a subtree that is not
         displayed is not on the page, and the legacy page does keep stale rows in its closed
         catalogue modal, so hidden subtrees are left out of the count. */
      elCount: visible.length,
      iconCount: visible.filter((el) => el.tagName === 'I' && /\bfa[a-z-]*\b/.test(String(el.className))).length,
      docH: document.documentElement.scrollHeight,
    };
};

/* A single reading can catch a page mid-flight - a webfont landing late, a re-render the framework
   has not committed yet, a scroll animation still running. Those movers make one page differ for a
   moment and then agree again, which reads as a difference that is really about timing rather than
   about the panels. So read until two readings in a row agree and compare that settled reading.
   The loop is capped: a page that keeps changing would be a real difference of its own, and the
   last reading is then reported like any other. */
async function snapshot(page) {
  let settled = await page.evaluate(readBody);
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(60);
    const next = await page.evaluate(readBody);
    if (JSON.stringify(next) === JSON.stringify(settled)) return next;
    settled = next;
  }
  return settled;
}

const CALC_STEPS = [
  ['initial', async () => {}],
  ['qty typed 3000', async (p) => { await p.fill('#qty-input', '3000'); }],
  ['qty 50 (below minimum)', async (p) => { await p.fill('#qty-input', '50'); }],
  ['preset 10,000', async (p) => { await p.click('#qty-presets [data-qty="10000"]'); }],
  ['qty +', async (p) => { await p.click('#btn-qty-plus'); }],
  ['qty -', async (p) => { await p.click('#btn-qty-minus'); }],
  ['bag = d_cut_med', async (p) => { await p.selectOption('#bag-select', 'd_cut_med'); }],
  ['bag = w_cut_xl', async (p) => { await p.selectOption('#bag-select', 'w_cut_xl'); }],
  ['add-on 2.5', async (p) => { await p.fill('#addon-cost-input', '2.5'); }],
  ['add-on cleared', async (p) => { await p.fill('#addon-cost-input', ''); }],
  ['category Box Bag', async (p) => { await p.click('#cat-chips [data-cat="Box Bag"]'); }],
  ['category all', async (p) => { await p.click('#cat-chips [data-cat="all"]'); }],
  ['quote details', async (p) => {
    await p.fill('#quote-customer', 'Keells Super');
    await p.fill('#quote-validity', '30');
    await p.fill('#quote-leadtime', '5 working days');
    await p.fill('#quote-notes', 'Prices exclude delivery.');
  }],
  ['tier row quote-at button', async (p) => { const b = p.locator('#tier-rows [data-qty]').first(); if (await b.count()) await b.click(); }],
  ['modal open + search', async (p) => {
    await p.click('#btn-catalog');
    await p.fill('#modal-search', 'pharmacy');
  }],
  ['modal sort by name', async (p) => { await p.selectOption('#modal-sort', 'name'); }],
  ['modal category W Cut', async (p) => { await p.click('#modal-cat-chips [data-mcat="W Cut Bag"]'); }],
  ['modal choose first', async (p) => { const b = p.locator('#catalog-modal-table [data-bag]:not([disabled])').first(); if (await b.count()) await b.click(); }],
  ['reset', async (p) => { await p.click('#btn-reset'); }],
];

const PRIVILEGED_CARD = {
  version: 1,
  updatedAt: '2026-01-05T09:00:00.000Z',
  tiers: [
    { min: 100, max: 499, markup: 0.6 },
    { min: 500, max: 4999, markup: 0.35 },
    { min: 5000, max: 9999, markup: 0.25 },
    { min: 10000, max: null, markup: 0.1 },
  ],
  settings: {
    minOrderQty: 250, allowManualMarkup: true, defaultValidityDays: 21,
    defaultLeadTime: '10 – 14 working days', companyName: 'MHS PACKAGING', companyTagline: 'Eco non-woven bag manufacturing', defaultNotes: 'Payment 50% advance.',
  },
  bags: [
    { id: 'box_type_1', category: 'Box Bag', name: 'Box Bag Type 1 (Small)', ref: 'Small Keells', gsm: '85-90', width: 32, height: 36, gusset: 11, minQty: 500, cost: 45.55, markup: 0.42, active: true },
    { id: 'box_type_2', category: 'Box Bag', name: 'Box Bag Type 2 (Large)', ref: 'Keells', gsm: '90-100', width: 34, height: 37, gusset: 18, minQty: 500, cost: 52, markup: null, active: true },
    { id: 'd_cut_small', category: 'D Cut Bag', name: 'D Cut Bag Small', ref: 'Small Rice Bag / Document 10kg', gsm: '80', width: 25, height: 33, gusset: 0, minQty: 500, cost: 22.5, markup: null, active: true },
    { id: 'w_cut_med', category: 'W Cut Bag', name: 'W Cut Bag Medium', ref: 'Pharmacy Bag', gsm: '30', width: 25, height: 45, gusset: 12, minQty: 500, cost: 14.5, markup: null, active: false },
  ],
};

const PRIV_STEPS = [
  ['privileged initial', async () => {}],
  ['manual markup mode', async (p) => { await p.click('#mode-manual'); }],
  ['manual markup 75%', async (p) => { await p.fill('#manual-markup-input', '75'); }],
  ['markup slider 20', async (p) => { await p.fill('#markup-slider', '20'); }],
  ['per-bag override bag', async (p) => { await p.selectOption('#bag-select', 'box_type_1'); }],
  ['back to tier rate', async (p) => { await p.click('#btn-markup-auto'); }],
];

/* A rate card with a stray category, a nameless duplicate id and out-of-range numbers, pasted
   into the import box: exercises the importer, the normaliser and the validator at once. */
const IMPORT_CARD = {
  version: 1,
  updatedAt: '2026-02-01T08:30:00.000Z',
  tiers: [{ min: 100, max: 999, markup: 0.5 }, { min: 1000, max: null, markup: 0.3 }],
  settings: {
    minOrderQty: 100, allowManualMarkup: false, defaultValidityDays: 14,
    defaultLeadTime: '3 weeks', companyName: 'Imported Co', companyTagline: 'Imported strapline',
    defaultNotes: 'Imported note.',
  },
  bags: [
    { id: 'imp_1', category: 'W Cut Bag', name: 'Imported bag', ref: 'Imported ref', gsm: '60', width: 20, height: 30, gusset: 8, minQty: 100, cost: 12.5, markup: null, active: true },
    { id: 'imp_2', category: 'Garment Bag', name: 'Second import', ref: '', gsm: '', width: 0, height: 0, gusset: 0, minQty: 5, cost: 0, markup: 0.9, active: false },
  ],
};

const ADMIN_STEPS = [
  ['admin locked', async () => {}],
  ['wrong password', async (p) => {
    const input = p.locator('input[type="password"]').first();
    if (await input.count()) {
      await input.fill('wrong-password');
      const btn = p.locator('button[type="submit"], #btn-unlock, #btn-login').first();
      if (await btn.count()) await btn.click();
      else await input.press('Enter');
      await p.waitForTimeout(150);
    }
  }],
  ['unlock', async (p) => {
    const input = p.locator('input[type="password"]').first();
    if (await input.count()) {
      await input.fill('mhs-admin');
      const btn = p.locator('button[type="submit"], #btn-unlock, #btn-login').first();
      if (await btn.count()) await btn.click();
      else await input.press('Enter');
      await p.waitForTimeout(250);
    }
  }],
  ['edit a cost', async (p) => {
    const cell = p.locator('table input[type="number"]').first();
    if (await cell.count()) { await cell.fill('99.99'); await p.waitForTimeout(80); }
  }],
  ['cost 0 (validator)', async (p) => {
    const cell = p.locator('#bag-rows tr').first().locator('[data-field="cost"]');
    if (await cell.count()) { await cell.fill('0'); await p.waitForTimeout(80); }
  }],
  ['tier markup 42.5', async (p) => {
    const cell = p.locator('#tier-rows [data-field="markupPct"]').first();
    if (await cell.count()) { await cell.fill('42.5'); await p.waitForTimeout(80); }
  }],
  ['tier 2 from qty 750', async (p) => {
    const cell = p.locator('#tier-rows [data-field="min"]').nth(1);
    if (await cell.count()) { await cell.fill('750'); await p.waitForTimeout(80); }
  }],
  ['add a band', async (p) => { await p.click('#btn-add-tier'); }],
  ['tidy the bands', async (p) => { await p.click('#btn-tidy-tiers'); }],
  ['preview box 2nd model', async (p) => {
    const sel = p.locator('#preview-bag');
    const value = await sel.locator('option').nth(1).getAttribute('value');
    if (value) await sel.selectOption(value);
  }],
  ['filter "cut"', async (p) => { await p.fill('#bag-filter', 'cut'); }],
  ['filter cleared', async (p) => { await p.fill('#bag-filter', ''); }],
  ['model 2 out of use', async (p) => {
    const box = p.locator('#bag-rows input[type="checkbox"]').nth(1);
    if (await box.count()) await box.click();
  }],
  ['model 2 width + min qty', async (p) => {
    const row = p.locator('#bag-rows tr').nth(1);
    const w = row.locator('[data-field="width"]');
    const q = row.locator('[data-field="minQty"]');
    if (await w.count()) await w.fill('41.5');
    if (await q.count()) await q.fill('250');
  }],
  ['model 2 category', async (p) => {
    const sel = p.locator('#bag-rows select').nth(1);
    if (await sel.count()) await sel.selectOption('D Cut Bag');
  }],
  ['duplicate model 2', async (p) => {
    const b = p.locator('#bag-rows [data-action="dup-bag"]').nth(1);
    if (await b.count()) await b.click();
  }],
  ['delete the last model', async (p) => {
    const b = p.locator('#bag-rows [data-action="del-bag"]').last();
    if (await b.count()) await b.click();
  }],
  ['settings edited', async (p) => {
    await p.fill('#set-company', 'MHS PACKAGING (PVT) LTD');
    await p.fill('#set-tagline', 'Eco non-woven bag manufacturing');
    await p.fill('#set-minorder', '300');
    await p.fill('#set-validity', '30');
    await p.fill('#set-lead', '7 working days');
    await p.fill('#set-notes', 'Half payment with the order.');
    await p.click('#set-allow-manual');
  }],
  ['settings name blanked', async (p) => { await p.fill('#set-company', '   '); }],
  ['settings name restored', async (p) => { await p.fill('#set-company', 'MHS PACKAGING (PVT) LTD'); }],
  ['password: wrong current', async (p) => {
    await p.fill('#pw-current', 'nope');
    await p.fill('#pw-new', 'brandnewpass1');
    await p.fill('#pw-confirm', 'brandnewpass1');
    await p.click('#btn-change-pw');
  }],
  ['password: too short', async (p) => {
    await p.fill('#pw-current', 'mhs-admin');
    await p.fill('#pw-new', 'short');
    await p.fill('#pw-confirm', 'short');
    await p.click('#btn-change-pw');
  }],
  ['password: mismatch', async (p) => {
    await p.fill('#pw-new', 'brandnewpass1');
    await p.fill('#pw-confirm', 'brandnewpass2');
    await p.click('#btn-change-pw');
  }],
  ['password: changed in draft', async (p) => {
    await p.fill('#pw-confirm', 'brandnewpass1');
    await p.click('#btn-change-pw');
  }],
  ['import pasted JSON', async (p) => {
    await p.fill('#import-text', JSON.stringify(IMPORT_CARD));
    await p.click('#btn-import');
  }],
  ['import broken JSON', async (p) => {
    await p.fill('#import-text', '{ not json');
    await p.click('#btn-import');
  }],
  ['revert the draft', async (p) => { await p.click('#btn-revert'); }],
  ['reset to factory', async (p) => { await p.click('#btn-reset'); }],
  ['lock the panel', async (p) => { await p.click('#btn-lock'); }],
  ['unlock again', async (p) => {
    await p.fill('#admin-password', 'brandnewpass1');
    await p.click('#btn-unlock');
    await p.waitForTimeout(250);
  }],
  /* the draft password above was never saved, so that unlock fails on both pages and the panel is
     still hidden: this one uses the stored password, which walks the lock -> unlock round trip
     through a second full render of every table */
  ['unlock with the stored password', async (p) => {
    await p.fill('#admin-password', 'mhs-admin');
    await p.click('#btn-unlock');
    await p.waitForTimeout(250);
  }],
];

function diff(a, b, label) {
  const out = [];
  const info = [];
  const tight = (s) => (s === undefined ? '' : String(s).replace(/\s+/g, ''));
  /* The port's preview panel is a fraction of a pixel shorter than the legacy one (see readBody),
     which lifts everything below it in the same column by that same fraction. Realigning those
     boxes with the panel's own height delta keeps a genuine layout shift underneath the panel
     visible while the deliberate redesign of the panel itself is not reported as a dozen unrelated
     differences. Both snapshots hold whole pixels, so a realigned box may land a pixel away from
     the legacy one - a real shift of the column moves in tens of pixels and is still caught. */
  const panelDelta = a.panel && b.panel ? a.panel[1] - b.panel[1] : 0;
  const realign = (box) => {
    const [x, y, w, h] = String(box).split(',').map(Number);
    return [x, y + panelDelta, w, h].join(',');
  };
  /* the same place, allowing for the pixel the panel's own sub-pixel height rounds away */
  const sameBox = (one, two) => {
    const [ax, ay, aw, ah] = String(one).split(',').map(Number);
    const [bx, by, bw, bh] = String(two).split(',').map(Number);
    return ax === bx && aw === bw && ah === bh && Math.abs(ay - by) <= 1;
  };
  /* A long value (the whole dashboard reads as one string) is useless when it is sliced from the
     front: show the first place the two run apart instead, with a little context either side. */
  const show = (x, y) => {
    const a = String(x), b = String(y);
    if (Math.max(a.length, b.length) <= 400) return JSON.stringify(x) + '\n    react : ' + JSON.stringify(y);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
    const from = Math.max(0, i - 90);
    return '…' + a.slice(from, i + 160) + '…\n    react : …' + b.slice(from, i + 160) + '…';
  };
  const keys = new Set([...Object.keys(a.ids), ...Object.keys(b.ids)]);
  for (const k of keys) {
    const x = a.ids[k], y = b.ids[k];
    if (!x) { out.push(`id #${k}: missing in legacy`); continue; }
    if (!y) { out.push(`id #${k}: missing in react`); continue; }
    /* An invisible subtree cannot be compared: the legacy script leaves the closed catalogue
       modal holding whatever it last rendered, while the React page always keeps it current.
       Nobody can see either version until the modal is opened, and opening it refreshes both. */
    if (x.hidden === true && y.hidden === true) continue;
    for (const field of ['text', 'cls', 'value', 'hidden', 'box']) {
      const dflt = field === 'hidden' ? false : undefined;
      const xv = x[field] === undefined ? dflt : x[field];
      const yv = y[field] === undefined ? dflt : y[field];
      /* the one box that may differ by the preview panel's height, and by nothing else */
      const realigned = !!panelDelta && field === 'box' && x.afterPanel && y.afterPanel;
      const yvCompared = realigned ? realign(yv) : yv;
      if (realigned ? sameBox(xv, yvCompared) : String(xv) === String(yvCompared)) continue;
      /* whitespace-only text differences are invisible: the same characters, just laid out on
         different lines. Boxes catch the cases where whitespace really is visible. */
      if (field === 'text' && tight(xv) === tight(yv)) {
        info.push(`id #${k} .text (whitespace only)`);
        continue;
      }
      out.push(`id #${k} .${field}\n    legacy: ${show(xv, yvCompared)}`);
    }
  }
  for (const field of ['tierRows', 'tierInputs', 'bagRows', 'bagInputs', 'bagCats', 'logRows', 'previewOptions', 'setValues', 'modalRows', 'sheet', 'bodyClass', 'elCount', 'iconCount', 'docH']) {
    if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) {
      const x = JSON.stringify(a[field]), y = JSON.stringify(b[field]);
      if (field !== 'sheet' && tight(x) === tight(y)) { info.push(`${label}.${field} (whitespace only)`); continue; }
      out.push(`${label}.${field} differs\n    legacy: ${show(a[field], b[field])}`);
    }
  }
  return { out, info };
}

async function runSteps(browser, url, steps, card, shotsDir, tag) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (card) {
    await context.addInitScript((doc) => {
      try { localStorage.setItem('mhs-rates-v1', JSON.stringify(doc)); } catch (e) { /* ignore */ }
    }, card);
  }
  const page = await context.newPage();
  /* Three presentation details are pure wall-clock noise here, and both runs have to be shorn of
     them or the same page can be caught at different points of the same animation:
       1. CSS transitions. The toast fades in over .25s and the modal/save bar slide; measuring a
          frame in flight reports a box that is on its way somewhere, not the layout being
          compared. Both pages are asked for the settled state instead.
       2. Smooth scrolling. The calculator sets `html { scroll-behavior: smooth }` (the legacy page
          does the same), which turns the snapshot's `window.scrollTo(0, 0)` into an animation: read
          back in the same tick it still reports the offset a synthetic click left the page at, and
          because the two pages scroll to different offsets the fixed toast and the sticky header
          come out 3px to 500px apart. Instant scrolling makes that reset take effect immediately.
       3. The toast auto-hide. It is a 3.8s timer in the admin panel (3.4s in the calculator), and
          the two runs reach a given step at slightly different wall-clock times, so one page can
          be caught mid fade while the other still shows the toast - a 5px box difference that says
          nothing about the app. Long waits are frozen in both pages, so the toast is compared in
          the state the action under test left it in. Short waits - the 300ms validation debounce,
          the 2.5s fetch abort - are untouched.
     Nothing in either page listens for transitionend or animationend, and neither page scrolls
     itself, so neither changes behaviour when the transitions and the scroll animation are taken
     away. setInterval is not used by either panel. */
  await context.addInitScript(() => {
    const css = '*,*::before,*::after{transition:none!important;animation:none!important;'
      + 'scroll-behavior:auto!important}';
    const style = document.createElement('style');
    style.textContent = css;
    const host = document.head || document.documentElement;
    if (host) host.insertBefore(style, host.firstChild);
    else document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.insertBefore(style, document.documentElement.firstChild);
    }, { once: true });

    const realSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (fn, delay, ...rest) =>
      (typeof delay === 'number' && delay >= 3000 ? -1 : realSetTimeout(fn, delay, ...rest));
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  /* Playwright dismisses dialogs by default, which would silently skip every confirm()-guarded
     path (delete a band, delete a model, reset, revert). Both pages get the same answer. */
  page.on('dialog', (d) => { d.accept(); });
  await page.goto(BASE + url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);   // webfonts settle before anything is measured
  await page.waitForTimeout(1200);

  const results = {};
  for (const [name, act] of steps) {
    await act(page);
    /* Both panels re-validate 300ms after the last keystroke (the legacy debouncedValidate() and the
       port's equivalent effect), and a reply is only a few ms behind the timer it schedules. A wait
       anywhere near that edge - 260ms used to sit right on it, and the tier steps add another 80ms
       of their own - can therefore catch one page with the freshly validated problem list and the
       other with the previous one, which shows up as a warning box that is present on one side
       only. Wait past the debounce instead and compare two settled pages. */
    await page.waitForTimeout(400);
    results[name] = await snapshot(page);
    if (shotsDir) {
      const file = `${shotsDir}/${tag}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
      await page.screenshot({ path: file, fullPage: true });
    }
  }
  await context.close();
  return { results, errors };
}

function scrub(o) {
  return JSON.parse(JSON.stringify(o).replace(NORM_REF, 'MHS-REF'));
}

const pageName = arg('page', 'calculator');
const shots = process.argv.includes('--shots');
const shotsDir = shots ? root + '_baseline\\shots' : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' });
const [reactUrl, legacyUrl] = PAGES[pageName];

const scenarios = pageName === 'calculator'
  ? [['default', CALC_STEPS, null], ['privileged', PRIV_STEPS, PRIVILEGED_CARD]]
  : [['admin', ADMIN_STEPS, null]];

let problems = 0;
const report = [];
const infos = [];
for (const [name, steps, card] of scenarios) {
  const legacy = await runSteps(browser, legacyUrl, steps, card, shotsDir, `legacy-${name}`);
  const react = await runSteps(browser, reactUrl, steps, card, shotsDir, `react-${name}`);
  for (const [step] of steps) {
    const d = diff(scrub(legacy.results[step]), scrub(react.results[step]), `${name}/${step}`);
    infos.push(...d.info);
    if (d.out.length) {
      problems += d.out.length;
      report.push(`\n=== ${name} :: ${step} :: ${d.out.length} difference(s) ===`);
      report.push(...d.out.slice(0, Number(arg('lines', '14'))));
    }
  }
  if (legacy.errors.length || react.errors.length) {
    report.push(`\n=== ${name} console/page errors ===`);
    if (legacy.errors.length) report.push('legacy: ' + legacy.errors.join(' | '));
    if (react.errors.length) report.push('react : ' + react.errors.join(' | '));
  }
  console.log(`${name}: ${steps.length} steps compared`);
}
await browser.close();

const reportName = arg('report', 'parity-report.txt');
writeFileSync(root + '_baseline\\' + reportName, report.join('\n') || 'no differences', 'utf8');
console.log(`whitespace-only differences (not rendered): ${infos.length}`);
console.log(problems ? `\n${problems} difference(s) - see _baseline/${reportName}` : '\nPARITY OK - no differences');
if (problems) console.log(report.join('\n').slice(0, 5000));
/* non-zero exit so a script can tell pass from fail without parsing the text (see verify.mjs) */
process.exitCode = problems ? 1 : 0;
