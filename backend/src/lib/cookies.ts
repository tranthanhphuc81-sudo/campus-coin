/**
 * cookies.ts
 * Refresh-token cookie helpers. No `cookie-parser` dependency: the cookie is HttpOnly (never
 * read by JS anyway) and we only ever need to read/write this one cookie, so a tiny manual
 * parser keeps the dependency list small (CLAUDE.md rule 4).
 * Main exports: setRefreshCookie, clearRefreshCookie, readRefreshCookie
 * Spec: docs/spec/09 §9.5 (Table 53 – refresh token cookie)
 */
import type { Request, Response } from 'express';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from '@campuscoin/shared';

/** Cookie attributes shared by set/clear so they always match exactly (browsers require this to clear). */
const COOKIE_ATTRS = `Path=${REFRESH_COOKIE_PATH}; HttpOnly; Secure; SameSite=Strict`;

/**
 * Sets the HttpOnly refresh-token cookie on the response.
 * @param res - Express response.
 * @param token - Plaintext refresh token (only ever sent to the browser, never logged/stored).
 * @param maxAgeMs - Cookie lifetime in milliseconds (7d default, 30d "remember me", 8h admin).
 */
export function setRefreshCookie(res: Response, token: string, maxAgeMs: number): void {
  const maxAgeSec = Math.floor(maxAgeMs / 1000);
  res.append(
    'Set-Cookie',
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(token)}; ${COOKIE_ATTRS}; Max-Age=${maxAgeSec}`,
  );
}

/**
 * Clears the refresh-token cookie (logout). Attributes must match {@link setRefreshCookie}
 * exactly, otherwise some browsers keep the original cookie around.
 * @param res - Express response.
 */
export function clearRefreshCookie(res: Response): void {
  res.append('Set-Cookie', `${REFRESH_COOKIE_NAME}=; ${COOKIE_ATTRS}; Max-Age=0`);
}

/**
 * Reads the refresh-token cookie from the raw `Cookie` request header.
 * @param req - Express request.
 * @returns The decoded token, or undefined if the cookie is absent/malformed.
 */
export function readRefreshCookie(req: Request): string | undefined {
  const header = req.header('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== REFRESH_COOKIE_NAME) continue;
    const rawValue = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return undefined;
    }
  }
  return undefined;
}
