/**
 * imports.routes.ts
 * Router for `/api/v1/imports`: every route requires an authenticated student. `POST /` adds the
 * 10/hour upload rate limit (Table 46) plus the memory-storage multer middleware; `POST /:id/commit`
 * adds `Idempotency-Key` support (Table 40).
 * Main exports: importsRouter
 * Spec: docs/spec/07 §7.3.2 (imports) · Table 40 (idempotency) · Table 46 (rate limits)
 */
import { Router } from 'express';
import { Role, importBatchQuerySchema, updateImportRowsSchema, uuidParamSchema } from '@campuscoin/shared';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { idempotency } from '../../lib/idempotency.js';
import { RATE_LIMIT_PRESETS } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import * as importsController from './imports.controller.js';
import { uploadCsv } from './imports.upload.js';

/** Router mounted at `/api/v1/imports`. */
export const importsRouter: Router = Router();

// authenticate/authorize run first so every rate-limit/idempotency key below (req.auth.userId) is set.
importsRouter.use(authenticate, authorize(Role.STUDENT), ...RATE_LIMIT_PRESETS.authenticatedDefault);

// Declared before `/:id` so a literal "template" id is never swallowed by the id route.
importsRouter.get('/template', importsController.getTemplate);

importsRouter.post('/', ...RATE_LIMIT_PRESETS.importsCreate, uploadCsv, importsController.uploadImport);

importsRouter.get('/:id', validate({ params: uuidParamSchema, query: importBatchQuerySchema }), importsController.getImportBatch);

importsRouter.patch(
  '/:id/rows',
  validate({ params: uuidParamSchema, body: updateImportRowsSchema }),
  importsController.updateImportRows,
);

importsRouter.delete('/:id', validate({ params: uuidParamSchema }), importsController.discardImport);

importsRouter.post('/:id/commit', idempotency, validate({ params: uuidParamSchema }), importsController.commitImport);

importsRouter.get('/:id/errors.csv', validate({ params: uuidParamSchema }), importsController.getImportErrorsCsv);
