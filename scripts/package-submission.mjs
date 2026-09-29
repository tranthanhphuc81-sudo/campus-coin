#!/usr/bin/env node
/**
 * package-submission.mjs
 * Assembles the `submission/` folder (gitignored) for hand-off to the evaluation committee:
 * a full copy of the repo source tree (minus build/local/secret junk), plus a generated
 * `submission/TODO-MANUAL.md` listing what a human still has to add by hand (video demo, deployed
 * URL, etc). Safe to re-run any time — it always starts from a clean `submission/` directory.
 * Cross-platform (Windows/macOS/Linux): uses `fs.cpSync`/`fs.rmSync` only, no shell `rm -rf`/`cp -r`.
 * Usage: `npm run package:submission` (root). Best run after `npm run docs:openapi -w backend`
 * and `npm run db:export -w backend`, so `docs/openapi.yaml` and `database/*.sql` are fresh.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUBMISSION_DIR = path.join(ROOT, 'submission');

/**
 * Top-level-or-nested directory names never copied into the submission: build output, dependency
 * trees, VCS metadata, local dev tooling and generated test artefacts (docs/spec §11 + CLAUDE.md
 * — none of these belong in a source hand-off).
 */
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
  'blob-report',
  'submission',
  '.claude', // local Claude Code session/tooling state — never part of the deliverable.
]);

/** File/dir names excluded regardless of where they appear (secrets, OS/editor junk). */
const EXCLUDED_BASENAMES = new Set(['.DS_Store', 'Thumbs.db']);

/**
 * True when `basename` is an env file that must never leave the machine — every `.env*` variant
 * EXCEPT the two committed, secret-free examples.
 * @param basename - File name only (no directory).
 */
function isSecretEnvFile(basename) {
  if (basename === '.env.example' || basename === '.env.production.example') return false;
  return basename === '.env' || basename.startsWith('.env.');
}

/**
 * `fs.cpSync` filter: return `false` to skip a path (and everything under it, for a directory).
 * @param src - Absolute source path being considered.
 */
function copyFilter(src) {
  const rel = path.relative(ROOT, src);
  if (rel === '') return true; // the root itself
  const segments = rel.split(path.sep);
  const basename = segments[segments.length - 1];
  if (segments.some((seg) => EXCLUDED_DIR_NAMES.has(seg))) return false;
  if (EXCLUDED_BASENAMES.has(basename)) return false;
  if (isSecretEnvFile(basename)) return false;
  // Stray local log files (`.gitignore`'s own `*.log` rule) — e.g. a leftover full-suite test
  // run's multi-MB output — never belong in a graded submission.
  if (basename.endsWith('.log')) return false;
  return true;
}

/**
 * Recursively copies `srcDir` into `destDir`, applying {@link copyFilter} to every entry.
 * Hand-rolled instead of `fs.cpSync(ROOT, SUBMISSION_DIR, ...)` because `fs.cpSync` refuses
 * outright (`ERR_FS_CP_EINVAL`) to copy a directory into its own subdirectory — true here since
 * `submission/` lives inside the repo root — even though the filter would skip it anyway.
 */
function copyDir(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    if (!copyFilter(srcPath)) continue;
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      copyFileSync(srcPath, destPath);
    }
    // Symlinks are intentionally skipped — the repo has none of significance, and copying a
    // symlink target across OSes (Windows dev machine, Linux CI) is a common source of surprises.
  }
}

/** Recreates `submission/` empty, then copies the whole (filtered) repo tree into it. */
function copySourceTree() {
  // maxRetries/retryDelay: Windows (antivirus/indexer) sometimes holds a just-copied file open
  // for a moment; fs.rmSync's built-in retry (EPERM/EBUSY) handles that instead of failing hard.
  rmSync(SUBMISSION_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  copyDir(ROOT, SUBMISSION_DIR);
  console.info(`[package-submission] copied source tree -> ${SUBMISSION_DIR}`);
}

/** Human-friendly presence check used to build the TODO-MANUAL.md checklist below. */
function present(relPath) {
  return existsSync(path.join(ROOT, relPath));
}

/**
 * Writes `submission/TODO-MANUAL.md`: everything the automated packaging step cannot produce
 * itself, each with a checkbox and a one-line reason.
 */
function writeTodoManual() {
  const readmeDocxOk = present('docs/ReadMe.docx');
  const readmeMdOk = present('docs/ReadMe.md');
  const openapiOk = present('docs/openapi.yaml');
  const schemaOk = present('database/campus_coin_schema.sql');
  const seedOk = present('database/seed.sql');
  const csvSampleOk = present('docs/samples/transactions-sample.csv');

  const lines = [
    '# Manual submission checklist',
    '',
    '> Generated by `npm run package:submission` — re-run after fixing any item below (it always',
    '> rebuilds this file). Items already present in the repo at generation time are checked off;',
    "> re-check by hand before the real hand-off, this script only checks that a file exists, not",
    '> that its content is finished.',
    '',
    '## Must add by hand (cannot be automated)',
    '',
    '- [ ] Video demo `.mp4` — record a short walkthrough (login, add transaction, budget alert,',
    '      AI category suggestion, insights/tips, admin portal) and drop it in `submission/`.',
    '- [ ] Deployed URL — add the live deployment link (see `docs/deploy.md`) to `README.md` and/or',
    '      a `submission/DEPLOYED-URL.txt` file.',
    `- [ ] \`docs/AI-DECLARATION.md\` — fill in the **Reviewer** column (blank by design, docs/spec` +
      ' Appendix D) with the name(s) of whoever reviewed each AI tool\'s output.',
    `${readmeDocxOk ? '- [x]' : '- [ ]'} \`docs/ReadMe.docx\` — ${
      readmeDocxOk
        ? 'present, copied into this package.'
        : readmeMdOk
          ? 'MISSING. `docs/ReadMe.md` exists — convert it with pandoc: ' +
            '`pandoc docs/ReadMe.md -o docs/ReadMe.docx` (Windows: `winget install JohnMacFarlane.Pandoc` first), ' +
            'then re-run `npm run package:submission`.'
          : 'MISSING, and so is `docs/ReadMe.md` to convert. Write `docs/ReadMe.md` first (P21 task 6), then ' +
            'convert with pandoc and re-run this script.'
    }`,
    '',
    '## Sanity-checked by this script (already in the repo — re-verify before submitting)',
    '',
    `${openapiOk ? '- [x]' : '- [ ] MISSING —'} \`docs/openapi.yaml\` (run \`npm run docs:openapi -w backend\`)`,
    `${schemaOk ? '- [x]' : '- [ ] MISSING —'} \`database/campus_coin_schema.sql\` (run \`npm run db:export -w backend\`)`,
    `${seedOk ? '- [x]' : '- [ ] MISSING —'} \`database/seed.sql\` (run \`npm run db:export -w backend\`)`,
    `${csvSampleOk ? '- [x]' : '- [ ] MISSING —'} \`docs/samples/transactions-sample.csv\``,
    '',
  ];

  writeFileSync(path.join(SUBMISSION_DIR, 'TODO-MANUAL.md'), lines.join('\n'), { encoding: 'utf8' });
  console.info('[package-submission] wrote submission/TODO-MANUAL.md');
}

/** Quick line-count summary so a human can eyeball that the copy looks reasonable. */
function summarize() {
  const topLevel = readdirSync(SUBMISSION_DIR);
  console.info(`[package-submission] submission/ has ${topLevel.length} top-level entries:`, topLevel.join(', '));
  const dbDir = path.join(SUBMISSION_DIR, 'database');
  if (existsSync(dbDir)) {
    for (const f of readdirSync(dbDir)) {
      const size = statSync(path.join(dbDir, f)).size;
      console.info(`  database/${f} (${(size / 1024).toFixed(1)} KB)`);
    }
  }
}

copySourceTree();
writeTodoManual();
summarize();
console.info('[package-submission] done.');
