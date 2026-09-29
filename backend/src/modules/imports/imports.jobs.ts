/**
 * imports.jobs.ts
 * Thin BullMQ producer for the `import.parse` queue. Kept separate from `imports.service.ts` so
 * integration tests can `vi.mock` this module to run `parseBatch` inline instead of needing a
 * real worker process — `imports.service.ts` must never call `importParseQueue` directly.
 * Main exports: enqueueImportParse
 * Spec: docs/spec/04 §4.5 (Table 13 – import.parse)
 */
import { importParseQueue } from '../../jobs/queues.js';
import type { ImportParseJobData } from './imports.types.js';

/**
 * Enqueues one `import.parse` run. The job id includes `rev` so a stale re-parse job (superseded
 * by a later `PATCH /imports/:id/rows` options change before it even ran) never collides with, or
 * is deduped against, the newer one.
 */
export async function enqueueImportParse(data: ImportParseJobData): Promise<void> {
  await importParseQueue.add('parse', data, { jobId: `${data.batchId}-rev-${data.rev}` });
}
