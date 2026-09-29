#!/usr/bin/env node
/**
 * generate-dev-certs.mjs
 * Generates a throwaway self-signed TLS certificate for LOCAL testing of
 * docker-compose.prod.yml on Windows/Docker Desktop (prompts/20 completion criteria — real
 * production uses Let's Encrypt via certbot instead, see docs/deploy.md). Shells out to the
 * `openssl` binary (ships with Git for Windows, already a prerequisite for this project) rather
 * than adding a certificate-generation npm dependency (CLAUDE.md rule 4).
 * Usage: `npm run certs:dev` (root package.json) — writes infra/certs/{privkey,fullchain}.pem
 * (git-ignored). Re-run any time to rotate; browsers will still warn "not trusted" — expected for
 * a self-signed cert, click through it for local testing only.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const certsDir = path.join(here, '..', 'infra', 'certs');
const keyPath = path.join(certsDir, 'privkey.pem');
const certPath = path.join(certsDir, 'fullchain.pem');

function findOpenssl() {
  for (const candidate of ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe']) {
    try {
      execFileSync(candidate, ['version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  console.error(
    '[certs] openssl not found on PATH. Install Git for Windows (ships with openssl) or OpenSSL ' +
      'directly, then re-run `npm run certs:dev`.',
  );
  process.exit(1);
}

const openssl = findOpenssl();
mkdirSync(certsDir, { recursive: true });

execFileSync(
  openssl,
  [
    'req',
    '-x509',
    '-nodes',
    '-newkey',
    'rsa:2048',
    '-days',
    '365',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1',
  ],
  { stdio: 'inherit' },
);

console.log(`[certs] wrote ${path.relative(process.cwd(), keyPath)} and ${path.relative(process.cwd(), certPath)}`);
console.log('[certs] self-signed — browsers will warn "not trusted"; expected for local testing only.');
if (!existsSync(certPath)) {
  console.error('[certs] openssl did not produce the expected output file.');
  process.exit(1);
}
