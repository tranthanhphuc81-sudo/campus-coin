/**
 * tokenStore.ts
 * Module-scoped holder for the in-memory access token. Deliberately NOT React state and NOT
 * localStorage — the access token must live in memory only (CLAUDE.md security invariant); it
 * is re-obtained via the HttpOnly refresh cookie on every full page load.
 * Exports: getAccessToken, setAccessToken
 */
let accessToken: string | null = null;

/** Returns the current in-memory access token, or `null` if not authenticated. */
export function getAccessToken(): string | null {
  return accessToken;
}

/** Sets (or clears, with `null`) the in-memory access token. */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}
