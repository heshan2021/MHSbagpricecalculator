/* npm run verify - golden parity for both pages, in one command.

   For each page it drives the legacy single-file page and the ported page through the identical
   script and compares every element that carries an id, the generated tables, the print sheet, the
   visible element/icon counts and the document height. _baseline/parity.mjs holds the details of
   what is compared and why; a difference is written to _baseline/parity-report-<page>.txt.

   Two things it needs, and does for you:
     - the local server on http://127.0.0.1:8080  (node serve.js) - it stops with a hint if that is
       not answering
     - a build of the port: the ported pages are compared as built (dist/), so it runs
       npm run build first, unless you pass --no-build

   Exit codes: 0 both pages match, 1 a difference was found, 2 it could not run the check. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:8080';
const PAGES = ['calculator', 'admin'];
const harness = fileURLToPath(new URL('./parity.mjs', import.meta.url));
const skipBuild = process.argv.includes('--no-build');

let answering = false;
try {
  answering = (await fetch(`${BASE}/api/rates`)).status < 500;
} catch {
  answering = false;
}
if (!answering) {
  console.error(`The local server is not answering on ${BASE}.`);
  console.error('Start it first:  node serve.js    (or double-click "Start Server.cmd")');
  process.exit(2);
}

if (!skipBuild) {
  console.log('building the port (npm run build) ...');
  /* a single command line, not an args array: Node asks for that when shell is in play, and the
     command is a constant anyway */
  const build = spawnSync('npm run build', { stdio: 'inherit', shell: true });
  if (build.status !== 0) {
    console.error('\nThe build failed - fix that first, the port is compared as built.');
    process.exit(2);
  }
}

const failed = [];
for (const page of PAGES) {
  console.log(`\n=== ${page} ===`);
  const run = spawnSync(process.execPath, [harness, `--page=${page}`, `--report=parity-report-${page}.txt`], { stdio: 'inherit' });
  if (run.status !== 0) failed.push(page);
}

if (failed.length) {
  console.error(`\nPARITY FAILED on: ${failed.join(', ')}`);
  console.error(`Detail: _baseline/parity-report-${failed[0]}.txt`);
  process.exit(1);
}
console.log(`\nPARITY OK - ${PAGES.join(' and ')} match the legacy pages.`);
