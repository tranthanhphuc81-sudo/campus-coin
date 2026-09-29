/**
 * env.d.ts
 * Augments Vite's built-in `ImportMetaEnv` with this app's own `VITE_*` client variables, so
 * `import.meta.env.VITE_TAWK_PROPERTY_ID` etc. are typed instead of falling back to `any`.
 * `tsconfig.json`'s `"types": ["vite/client", "node"]` already loads the base `ImportMetaEnv`
 * interface globally; this file merges into it (no imports/exports — kept as a global script).
 */

interface ImportMetaEnv {
  /** Tawk.to property id (docs/spec/03 §3.4); chat widget disabled entirely when unset. */
  readonly VITE_TAWK_PROPERTY_ID?: string;
  /** Tawk.to widget id; defaults to `'default'` when a property id is set but this is not. */
  readonly VITE_TAWK_WIDGET_ID?: string;
  /** Sentry DSN (P20); error monitoring disabled entirely when unset. */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
