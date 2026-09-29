/**
 * security.ts
 * HTTP security headers (docs/spec/09 §9.11, Table 57): CSP, HSTS, X-Content-Type-Options,
 * Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy, and disabling X-Powered-By.
 * Mounted once, right after requestId/logging (see app.ts).
 * Main exports: securityHeaders
 * Spec: docs/spec/09 §9.11 (Table 57)
 */
import helmet from 'helmet';
import type { RequestHandler } from 'express';

// helmet has no built-in Permissions-Policy middleware; set it directly.
const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=()';

/**
 * helmet, configured to match Table 57 exactly (Tawk.to is the only allowed third party).
 * A-L9: `useDefaults: false` + every directive listed explicitly — without it, helmet merges its
 * own default directives (e.g. `font-src 'self' https: data:`) on top of these, silently widening
 * the policy beyond what Table 57 specifies. `objectSrc: ['none']` is added explicitly too (not in
 * Table 57's text, but the safe default any complete CSP should state rather than leave implicit).
 */
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://embed.tawk.to'],
      connectSrc: ["'self'", 'https://*.tawk.to', 'wss://*.tawk.to'],
      imgSrc: ["'self'", 'data:', 'https://*.tawk.to'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameSrc: ['https://tawk.to'],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
  hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  // API is not the resource being embedded/loaded cross-origin; avoid COEP/CORP surprises for
  // clients until the frontend explicitly needs them.
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
});

/** Full security-header stack, applied as a single middleware. */
export const securityHeaders: RequestHandler[] = [
  helmetMiddleware,
  (_req, res, next) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    next();
  },
];
