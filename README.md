# MHS Bag Price Calculator — calculator + admin rate control

Two pages, one rate card:

| Page | Who it is for | What it does |
| --- | --- | --- |
| **Price calculator** (`bagpricecalculator v2.html`) | sales staff and customers | picks a bag, sets the quantity, shows the price per bag, the order value and a printable quotation |
| **Rate control** (`admin.html`) | administrators only (password) | one big table of every bag cost, the percentage markup bands and the quotation defaults |

Bag costs and markup percentages are privileged, so the calculator no longer shows them anywhere.
The price per bag still comes from them — see *How the numbers flow* below.

## Quick start (Windows)

1. Double-click **`Start Server.cmd`**
2. Your browser opens **http://localhost:8080/** (the calculator)
3. The dashboard is at **http://localhost:8080/admin**
4. Leave the black window open while you work. Press `Ctrl+C` (or close the window) to stop.

That's all — no installation and no build step.

### Administrator password

The dashboard asks for one password. The factory value is **`mhs-admin`** — change it under
**Security** in the dashboard as soon as you sign in. It is stored only as a hash, never as text.

Forgot it? Delete `catalog.json` next to `serve.js` (or clear this site's browser storage) and the
factory password works again.

## Other ways to start it

| Method | Command / action | URL |
| --- | --- | --- |
| Node (recommended) | `node serve.js` | http://localhost:8080/ (`/admin` for the dashboard) |
| Different port | `node serve.js --port=3000` | http://localhost:3000/ |
| No browser pop-up | `node serve.js --no-open` | http://localhost:8080/ |
| Python (any version 3) | `py -m http.server 8080` | http://localhost:8080/ shows the chooser page (`index.html`) |
| VS Code | Install the *Live Server* extension → right-click `index.html` → **Open with Live Server** | shown by VS Code |
| No server at all | just double-click `bagpricecalculator v2.html` or `admin.html` | works, but each browser keeps its own copy of the rates |

The Node server also prints a **Network** address (e.g. `http://192.168.1.10:8080/`) for phones and
tablets on the same Wi-Fi.

## How the numbers flow

```
admin.html  --save-->  this browser (localStorage 'mhs-rates-v1')
            --publish->  catalog.json in this folder  (PUT /api/rates)
                                 |
bagpricecalculator v2.html  <----+  reads the newest of the two on load
```

* The calculator keeps the same values as a **factory default** inside the file, so it always works
  (offline too) before anything is published.
* Prices are calculated in the browser: `price per bag = base cost × (1 + markup) + printing/add-on`.
  The markup comes from the quantity band, unless a model has its own **Override %**.
* Publishing needs the Node server. Without it the dashboard still saves in the browser, and
  **Export JSON** gives you a file you can move by hand.

### What the calculator still shows a customer

Price per bag, order value, price per 1,000 bags, the saving against the 100-bag rate, every quantity
band *with its price*, and the whole quotation sheet. What it no longer shows: the base cost, the
markup percentage, the subtotal before markup and the effective markup.

Two things worth knowing:

* **The percentage bands are hidden from the screen, not encrypted.** This is a static HTML page, so
  the numbers it needs are inside the page. Hiding them stops casual viewing; it will not stop someone
  who opens the browser developer tools. For real secrecy the pricing has to move to the server (then
  `serve.js` would calculate each quote) — ask if you want that put in.
* **Cost is hidden on purpose.** Showing the base cost next to the price would let anyone work out the
  markup with one division, so the cost left the customer-facing page as well.
* The optional **"Allow trusted staff to override the markup"** switch in the dashboard puts the markup
  selector back on the calculator page. Only enable it for managers: anyone who can set the markup to
  0% can read the base cost off the screen.

## Files in this folder

| File | What it is |
| --- | --- |
| `bagpricecalculator v2.html` | The calculator (works from `file://` too) |
| `admin.html` | The administrator dashboard: costs, markup bands, settings, password, backup, activity log |
| `catalog.json` | Created by the dashboard when it publishes — the shared rate card. Delete it to go back to factory values |
| `bagpricecalculator v1.html` | The original version, kept untouched for reference |
| `Start Server.cmd` | Double-click launcher for the local server |
| `serve.js` | Dependency-free Node server: the two pages plus the small rate API |
| `index.html` | The little chooser page (`/` on Python / Live Server, `/home` on Node) |
| `README.md` | This file |

### Server routes and API

| Route | Purpose |
| --- | --- |
| `/` , `/calculator` , `/index.html` | the calculator |
| `/admin` , `/dashboard` , `/admin.html` | the dashboard |
| `/home` , `/landing` | the chooser page |
| `GET /api/rates` | `{ ok, empty, source, savedAt, data }` — the published rate card (same-origin only, never cached) |
| `PUT /api/rates` (or `POST`) | writes `catalog.json`; needs the header `x-mhs-admin: <password hash>` |

The write API is same-origin only and accepts just the password hash stored in `catalog.json` (the
factory hash is accepted while no rate card exists yet). No cross-origin header is sent, so a random
website cannot read or overwrite the rates.

## Good to know

* **Internet on first load:** both pages pull Tailwind, FontAwesome, Inter and (calculator only)
  Three.js from CDNs, so they need a connection the first time. Ask if you want a fully offline copy.
* **Saved quotes are per-address.** Quotations live in the browser for the address you opened
  (`localhost:8080` and the `file://` path are separate storage). Use *Copy quotation* to move one
  between them.
* **The dashboard can be opened directly** by double-clicking `admin.html`. It then saves into that
  browser only, and the *publish* box turns itself off.
* **Handy buttons:** **Revert** throws away unsaved edits, **Reset to factory** puts the original 2026
  catalogue values back (your password survives), and **Export JSON** is your backup. Every save is
  listed in the activity log with what changed.
* **Quotation → PDF:** fill in step 4, then press **Print / PDF** and choose *Save as PDF* — the print
  layout contains only the quotation sheet.
* **Windows Firewall** may ask to allow Node the first time. Allow it on *Private networks* only if you
  want to open the calculator from a phone.
* **Stopping the server:** press `Ctrl+C` in the server window.

## Health check (optional)

With the server running: `/` → 200 (calculator) · `/admin` → 200 (dashboard) · `/api/rates` → 200 JSON ·
`PUT /api/rates` without the admin key → 401 · unknown file → 404 page with a file list · `POST /` → 405 ·
`/favicon.ico` → 204. If the browser says "can't reach this page", the server window was closed or Node
is blocked — restart `Start Server.cmd`.

