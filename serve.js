#!/usr/bin/env node
/**
 * MHS Bag Price Calculator - localhost static server (zero dependencies).
 *
 *   node serve.js                 -> http://localhost:8080
 *   node serve.js --port=3000     -> different port
 *   node serve.js --no-open       -> do not launch the browser
 *
 * Routing:
 *   /            -> calculator          (also /calculator, /calculator.html and /index.html)
 *   /admin       -> admin dashboard     (rate + markup control, password protected, also /dashboard)
 *   /home        -> the little landing page (the chooser)
 *
 * Pages are served from dist/ (the Vite build: index.html, calculator.html, admin.html) and fall
 * back to the untouched single-file pages in legacy/ when the project has not been built yet.
 *
 * Admin rate-card API (same-origin only, never cached):
 *   GET  /api/rates   -> { ok, empty, source, savedAt, data }  (data = catalog.json or null)
 *   PUT  /api/rates   -> writes catalog.json   (requires the "x-mhs-admin" password-hash header)
 *   POST /api/rates   -> same as PUT
 *
 * Press Ctrl+C to stop.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const ROOT = __dirname;

/* The React + Vite app is built into dist/. Until then the legacy single-file pages in legacy/
   are served instead, so the tool works before (and without) a build. */
const DIST = path.join(ROOT, 'dist');
const LEGACY_DIR = path.join(ROOT, 'legacy');
const ENTRIES = {
    calculator: { dist: 'calculator.html', legacy: 'bagpricecalculator v2.html' },
    admin: { dist: 'admin.html', legacy: 'admin.html' },
    home: { dist: 'index.html', legacy: 'index.html' }
};

function builtEntry(name) {
    const dist = path.join(DIST, ENTRIES[name].dist);
    if (fs.existsSync(dist)) return dist;
    const legacy = path.join(LEGACY_DIR, ENTRIES[name].legacy);
    if (fs.existsSync(legacy)) return legacy;
    return null;
}

/* Shared rate card written by the admin dashboard and read by the calculator. */
const RATES_ROUTE = '/api/rates';
const RATES_FILE = path.join(ROOT, 'catalog.json');
const RATES_MAX_BYTES = 2 * 1024 * 1024; // a real rate card is a few KB
// fnv1a('mhs-bags' + ':' + 'mhs-admin') - the factory administrator password.
const DEFAULT_ADMIN_HASH = '411289dd';

const argv = process.argv.slice(2);
const flag = (name) => {
    const hit = argv.find((a) => a.startsWith('--' + name + '='));
    return hit ? hit.slice(name.length + 3) : null;
};
const BASE_PORT = Number(flag('port') || process.env.PORT || 8080) || 8080;
const NO_OPEN = argv.includes('--no-open');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
    '.pdf': 'application/pdf'
};

function send(res, status, type, body, extra) {
    const headers = Object.assign(
        {
            'Content-Type': type,
            'Content-Length': Buffer.byteLength(body),
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        },
        extra || {}
    );
    res.writeHead(status, headers);
    res.end(body);
}

function listing() {

    let files = [];
    try {
        files = fs
            .readdirSync(ROOT, { withFileTypes: true })
            .filter((d) => d.isFile())
            .map((d) => d.name)
            .sort();
    } catch (e) {
        /* ignore */
    }
    const links = files
        .map((f) => `<li><a href="/${encodeURIComponent(f)}">${f.replace(/[<>&]/g, '')}</a></li>`)
        .join('');
    return `<!doctype html><meta charset="utf-8"><title>Not found</title>
<body style="font:15px/1.6 system-ui;max-width:34rem;margin:3rem auto;padding:0 1rem;color:#0f172a">
<h1 style="font-size:1.1rem">File not found</h1>
<p>Available files in this folder:</p><ul>${links}</ul>
<p><a href="/">Open the bag price calculator</a> · <a href="/admin">Administrator rate dashboard</a></p>`;
}

/* ==================== admin rate-card API ==================== */

function json(res, status, payload, headOnly) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    if (headOnly) {
        res.end();
        return;
    }
    res.end(body);
}

// the password hash currently stored in catalog.json (null when there is no file yet)
function storedAdminHash(cb) {
    fs.readFile(RATES_FILE, 'utf8', (err, txt) => {
        if (err) return cb(null);
        try {
            const doc = JSON.parse(txt);
            const hash = doc && doc.security && doc.security.adminHash;
            cb(typeof hash === 'string' && hash ? hash.toLowerCase() : null);
        } catch (e) {
            cb(null);
        }
    });
}

function readBody(req, cb) {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on('data', (chunk) => {
        if (settled) return;
        size += chunk.length;
        if (size > RATES_MAX_BYTES) {
            settled = true;
            cb({ code: 413, message: 'The rate card payload is larger than 2 MB' });
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });
    req.on('end', () => {
        if (!settled) cb(null, Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', () => {
        if (!settled) {
            settled = true;
            cb({ code: 400, message: 'The request body could not be read' });
        }
    });
}

function validateRates(doc) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return 'the body must be a JSON object';
    if (!Array.isArray(doc.bags) || doc.bags.length === 0) return 'bags must be a non-empty array';
    if (!Array.isArray(doc.tiers) || doc.tiers.length === 0) return 'tiers must be a non-empty array';
    for (const bag of doc.bags) {
        if (!bag || typeof bag.id !== 'string' || !bag.id.trim()) return 'every bag needs a text id';
        if (!Number.isFinite(Number(bag.cost)) || Number(bag.cost) <= 0) return 'bag "' + bag.id + '" needs a positive numeric cost';
    }
    for (const tier of doc.tiers) {
        if (!tier || !Number.isFinite(Number(tier.min))) return 'every tier needs a numeric "min" quantity';
        if (!Number.isFinite(Number(tier.markup))) return 'every tier needs a numeric "markup"';
    }
    if (!doc.security || typeof doc.security.adminHash !== 'string' || !doc.security.adminHash) {
        return 'security.adminHash is required (the dashboard always sends it)';
    }
    return null;
}

// write to a temp file first so a half-written rate card can never be served
function writeRates(doc, cb) {
    const tmp = RATES_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(doc, null, 2), 'utf8', (err) => {
        if (err) return cb(err);
        fs.rename(tmp, RATES_FILE, (err2) => cb(err2));
    });
}

function handleRates(req, res, done) {
    const headOnly = req.method === 'HEAD';

    if (req.method === 'GET' || headOnly) {
        fs.readFile(RATES_FILE, 'utf8', (err, txt) => {
            if (err) {
                json(res, 200, { ok: true, empty: true, source: 'server' }, headOnly);
                return done(200);
            }
            let data = null;
            try {
                data = JSON.parse(txt);
            } catch (e) {
                data = null;
            }
            if (!data) {
                json(res, 500, { ok: false, empty: true, source: 'server', error: 'catalog.json is not valid JSON. Fix or delete it, or press "Reset to factory defaults" on the admin page.' }, headOnly);
                return done(500);
            }
            json(res, 200, { ok: true, empty: false, source: 'server', savedAt: data.updatedAt || null, data }, headOnly);
            done(200);
        });
        return;
    }

    if (req.method !== 'PUT' && req.method !== 'POST') {
        json(res, 405, { ok: false, error: 'Use GET or PUT on ' + RATES_ROUTE });
        return done(405);
    }

    storedAdminHash((fileHash) => {
        const supplied = String(req.headers['x-mhs-admin'] || '').toLowerCase();
        // The dashboard always sends the hash of the password it was unlocked with.
        // Once a rate card exists, only the hash stored inside it is accepted; the
        // factory password is the bootstrap key for the first save, and the recovery
        // key again after catalog.json is deleted.
        const allowed = fileHash ? [fileHash] : [DEFAULT_ADMIN_HASH];
        if (!supplied || allowed.indexOf(supplied) === -1) {
            json(res, 401, { ok: false, error: 'Wrong or missing administrator key. Unlock the admin dashboard first, then save again.' });
            return done(401);
        }

        readBody(req, (readErr, body) => {
            if (readErr) {
                json(res, readErr.code || 400, { ok: false, error: readErr.message });
                return done(readErr.code || 400);
            }
            let doc = null;
            try {
                doc = JSON.parse(body);
            } catch (e) {
                doc = null;
            }
            const problem = validateRates(doc);
            if (problem) {
                json(res, 400, { ok: false, error: problem });
                return done(400);
            }
            writeRates(doc, (writeErr) => {
                if (writeErr) {
                    json(res, 500, { ok: false, error: 'Could not write catalog.json: ' + writeErr.message });
                    return done(500);
                }
                console.log('  saved catalog.json  (' + doc.bags.length + ' bags, ' + doc.tiers.length + ' tiers)');
                json(res, 200, { ok: true, savedAt: doc.updatedAt || new Date().toISOString(), bags: doc.bags.length, tiers: doc.tiers.length });
                done(200);
            });
        });
    });
}

/* Streams one existing file, with the same headers the legacy server sent. */
function serveFile(filePath, req, res, done) {
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            send(res, 404, MIME['.html'], listing());
            return done(404);
        }
        res.writeHead(200, {
            'Content-Type': type,
            'Content-Length': stat.size,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        });
        if (req.method === 'HEAD') {
            res.end();
            return done(200);
        }
        const stream = fs.createReadStream(filePath);
        stream.on('error', () => res.destroy());
        stream.pipe(res);
        stream.on('close', () => done(200));
    });
}

/* Shown only when neither dist/ nor legacy/ holds a page - the build has not run yet. */
function buildHelpPage() {
    return `<!doctype html><meta charset="utf-8"><title>Build the app first</title>
<body style="font:15px/1.6 system-ui;max-width:36rem;margin:3rem auto;padding:0 1.25rem;color:#0f172a">
<h1 style="font-size:1.15rem">MHS Bag Price Calculator - one build step needed</h1>
<p>The React/Vite pages have not been built yet and the legacy copy is missing, so there is nothing to serve.</p>
<pre style="background:#f0fdf4;border:1px solid #a7f3d0;border-radius:.6rem;padding:.9rem;overflow:auto">npm install
npm run build</pre>
<p>Reload this page afterwards. <code>Start Server.cmd</code> runs both steps for you.</p>`;
}

function lanAddresses() {
    const out = [];
    for (const list of Object.values(os.networkInterfaces())) {
        for (const ni of list || []) {
            if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
        }
    }
    return out;
}

const server = http.createServer((req, res) => {
    const at = Date.now();
    const done = (code) => console.log(`  ${code}  ${req.method} ${req.url}  (${Date.now() - at} ms)`);

    let urlPath;
    try {
        urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (e) {
        send(res, 400, MIME['.txt'], 'Bad request');
        return done(400);
    }

    // the rate API is handled before the GET/HEAD guard because it also accepts PUT/POST
    if (urlPath === RATES_ROUTE) return handleRates(req, res, done);

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        send(res, 405, MIME['.txt'], 'Method Not Allowed');
        return done(405);
    }

    // browsers ask for this automatically; answer quietly instead of logging a 404
    if (urlPath === '/favicon.ico' || urlPath === '/apple-touch-icon.png') {
        res.writeHead(204, { 'Cache-Control': 'max-age=86400' });
        res.end();
        return done(204);
    }

    // "/", "/index.html" and "/calculator" all open the v2 calculator
    /* ---- page routes: the Vite build in dist/, or the legacy pages in legacy/ ---- */
    const PAGE_ROUTES = {
        '/': 'calculator',
        '/index.html': 'calculator',
        '/calculator': 'calculator',
        '/calculator.html': 'calculator',
        '/admin': 'admin',
        '/admin.html': 'admin',
        '/dashboard': 'admin',
        '/home': 'home',
        '/home.html': 'home',
        '/landing': 'home'
    };
    const wanted = PAGE_ROUTES[urlPath.replace(/\/+$/, '') || '/'];
    if (wanted) {
        const target = builtEntry(wanted);
        if (target) return serveFile(target, req, res, done);
        send(res, 500, MIME['.html'], buildHelpPage());
        return done(500);
    }

    /* ---- static files: the project folder first, then the built bundle ---- */
    const relative = path.normalize(urlPath).replace(/^[/\\]+/, '');
    /* The rate card is privileged - every base cost plus the administrator password hash - and this
       server hands out the project folder, so without this guard catalog.json is also a plain
       downloadable file at /catalog.json. It stays reachable through the API alone (GET /api/rates
       for the document, PUT behind the x-mhs-admin key). The name is normalised, lowercased and
       stripped of separators because Windows file names are case-insensitive, so /catalog.json,
       /Catalog.JSON, /./catalog.json, /sub/../catalog.json and /catalog.json/ are one blocked name. */
    const flat = relative.replace(/^[/\\]+|[/\\]+$/g, '').toLowerCase();
    const ratesName = path.basename(RATES_FILE).toLowerCase();
    if (flat === ratesName || flat === ratesName + '.tmp') {
        send(res, 403, MIME['.txt'], 'Forbidden');
        return done(403);
    }

    const candidates = [path.join(ROOT, relative), path.join(DIST, relative)];
    for (const candidate of candidates) {
        if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) {
            send(res, 403, MIME['.txt'], 'Forbidden');
            return done(403);
        }
    }
    const filePath = candidates.find((candidate) => {
        try {
            return fs.statSync(candidate).isFile();
        } catch (e) {
            return false;
        }
    });
    if (!filePath) {
        send(res, 404, MIME['.html'], listing());
        return done(404);
    }
    serveFile(filePath, req, res, done);
});

let tries = 0;
function listen(port) {
    server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && tries < 10) {
            tries += 1;
            console.log(`Port ${port} is busy - trying ${port + 1} ...`);
            listen(port + 1);
        } else {
            console.error('\nCould not start the server:', err.message);
            process.exit(1);
        }
    });
    // no explicit host -> dual-stack (IPv6 + IPv4), so both "localhost" and
    // "127.0.0.1" reach the server on every Windows/Unix setup
    server.listen(port, () => {
        const url = `http://localhost:${port}/`;
        console.log('\n  MHS Bag Price Calculator - local server');
        console.log('  ' + '-'.repeat(46));
        console.log(`  Calculator: ${url}`);
        console.log(`              http://127.0.0.1:${port}/`);
        console.log(`  Admin:      http://localhost:${port}/admin    (password protected)`);
        for (const ip of lanAddresses()) {
            console.log(`  Network:    http://${ip}:${port}/   (phones/tablets on the same Wi-Fi)`);
        }
        console.log(`  Serving:    ${ROOT}`);
        console.log(`  Pages:      ${fs.existsSync(path.join(DIST, 'index.html')) ? 'dist/ (Vite build)' : 'legacy/ (single-file pages - run: npm run build)'}`);
        console.log('  Press Ctrl+C to stop.\n');
        openBrowser(url);
    });
}

function openBrowser(url) {
    if (NO_OPEN) return;
    try {
        if (process.platform === 'win32') {
            spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
        } else if (process.platform === 'darwin') {
            spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
        } else {
            spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
        }
    } catch (e) {
        /* the URL is printed anyway */
    }
}

listen(BASE_PORT);

// Ctrl+C (or a stop signal) shuts the server down cleanly
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
    process.on(sig, () => {
        console.log('\n  Server stopped. You can close this window.');
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 800).unref();
    });
}
