/**
 * zodSetup.ts
 * Patches Zod with `.openapi()` (`@asteasolutions/zod-to-openapi`'s `extendZodWithOpenApi`) as a
 * pure side-effect import — MUST be `document.ts`'s first import. Zod v4 bakes each schema
 * instance's methods on at construction time rather than via live prototype delegation, so any
 * schema built (e.g. `@campuscoin/shared`'s ~70 schemas, or a local `.schema.ts` file) before
 * this patch runs would permanently lack `.openapi()`, and every later `registry.register(...)`
 * call on it would throw `TypeError: zodSchema.openapi is not a function`. Importing this module
 * first guarantees ES module evaluation order runs the patch before any other schema-defining
 * module in the import graph is evaluated.
 * Main exports: none (side effect only)
 * Spec: docs/spec/07 (API reference tooling)
 */
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);
