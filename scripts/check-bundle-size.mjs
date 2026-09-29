#!/usr/bin/env node
/**
 * check-bundle-size.mjs
 * Enforces docs/spec/10 §10.1 Bảng 60: "Bundle JS ban đầu < 200 KB gzip". Parses
 * `frontend/dist/index.html`'s own `<script type="module">` + `<link rel="modulepreload">` tags
 * (exactly what a fresh page load fetches before any route-level lazy chunk) and gzips each
 * referenced file the same way an HTTP server would, rather than trusting Vite's own build-log
 * numbers (which report per-chunk, not "what the browser needs for first paint").
 * Usage: `npm run build -w @campuscoin/frontend && npm run perf:bundle-check` (see docs/perf.md).
 * Exits 1 (and lists the offending chunks) when the total exceeds the budget.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BUDGET_BYTES = 200 * 1024;
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, '..', 'frontend', 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');

let html;
try {
  html = readFileSync(indexHtmlPath, 'utf8');
} catch {
  console.error(`[bundle-check] ${indexHtmlPath} not found — run \`npm run build -w @campuscoin/frontend\` first.`);
  process.exit(1);
}

// Every JS asset the browser fetches before the app can render anything: the entry
// `<script type="module" src="...">` plus every `<link rel="modulepreload" href="...">` Vite
// emits for its static import graph (lazy `React.lazy()` route chunks are NOT preloaded, so they
// correctly stay out of this list — see frontend/src/app/router.tsx's `page()` helper, P05).
const scriptSrcs = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) => m[1]);
const modulePreloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
const jsAssets = [...new Set([...scriptSrcs, ...modulePreloads])].filter((href) => href.endsWith('.js'));

if (jsAssets.length === 0) {
  console.error('[bundle-check] Found no initial JS assets in index.html — check the regexes above still match Vite\'s output.');
  process.exit(1);
}

let totalGzip = 0;
const rows = [];
for (const href of jsAssets) {
  const filePath = path.join(distDir, href.replace(/^\//, ''));
  const raw = readFileSync(filePath);
  const gzipSize = gzipSync(raw, { level: 9 }).length;
  totalGzip += gzipSize;
  rows.push({ href, rawSize: statSync(filePath).size, gzipSize });
}

rows.sort((a, b) => b.gzipSize - a.gzipSize);
for (const row of rows) {
  console.log(`  ${(row.gzipSize / 1024).toFixed(2).padStart(8)} KB gzip  (${(row.rawSize / 1024).toFixed(2)} KB raw)  ${row.href}`);
}

const totalKb = (totalGzip / 1024).toFixed(2);
const budgetKb = (BUDGET_BYTES / 1024).toFixed(0);
console.log(`\n[bundle-check] initial JS: ${totalKb} KB gzip (budget: ${budgetKb} KB)`);

if (totalGzip > BUDGET_BYTES) {
  console.error(`[bundle-check] FAIL — ${totalKb} KB exceeds the ${budgetKb} KB budget (docs/spec/10 §10.1). Split the largest chunk(s) above.`);
  process.exit(1);
}
console.log('[bundle-check] OK');
