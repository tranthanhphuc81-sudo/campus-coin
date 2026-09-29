/**
 * generate.ts
 * CLI: writes the in-memory OpenAPI document ({@link ../openapi/document.ts}) to
 * `docs/openapi.yaml` at the repo root. Run via `npm run docs:openapi -w backend`.
 * Main exports: none (CLI entry point only)
 * Spec: docs/spec/07 (API reference)
 */
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { buildOpenApiDocument } from './document.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** `<repo root>/docs/openapi.yaml` — `backend/src/openapi/` is 3 levels below the repo root. */
const OUTPUT_PATH = resolve(__dirname, '../../../docs/openapi.yaml');

/** Builds the document and writes it as YAML with LF line endings (CLAUDE.md Windows rule). */
async function main(): Promise<void> {
  const doc = buildOpenApiDocument();
  const yaml = stringify(doc, { lineWidth: 0 });
  await writeFile(OUTPUT_PATH, yaml, { encoding: 'utf8' });
  console.info(`[openapi] wrote ${OUTPUT_PATH}`);
}

main().catch((err: unknown) => {
  console.error('[openapi] generation failed:', err);
  process.exitCode = 1;
});
