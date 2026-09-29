/**
 * setup-env.ts
 * Vitest setup file: loads the root `.env` (if present) so DB integration tests find
 * DATABASE_URL. Variables already set in the shell/CI win (loadEnvFile never overrides).
 * Spec: docs/spec/12 (testing plan)
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
