/**
 * import-parse.processor.ts
 * Worker processor for the `import.parse` queue: parses an uploaded CSV into a preview batch.
 * All the real logic lives in `imports.service.ts`'s `parseBatch` (kept there so integration tests
 * can call it directly without a running worker).
 * Main exports: processImportParse
 * Spec: docs/spec/04 §4.5 (Table 13 – import.parse) · docs/spec/05a §5.5 (CSV import)
 */
import type { Job } from 'bullmq';
import * as importsService from '../../modules/imports/imports.service.js';
import type { ImportParseJobData } from '../../modules/imports/imports.types.js';

/** Processes one `import.parse` run: parses, validates and previews a CSV import batch. */
export async function processImportParse(job: Job<ImportParseJobData>): Promise<void> {
  await importsService.parseBatch(job.data);
}
