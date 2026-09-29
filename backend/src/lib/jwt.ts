/**
 * jwt.ts
 * Issues and verifies the app's EdDSA (Ed25519) JWTs: student/admin access tokens and the
 * short-lived admin MFA challenge token. `getPublicKey`/`getPrivateKey` cache the imported
 * `CryptoKey` so every sign/verify call doesn't re-parse the PEM. `middlewares/authenticate.ts`
 * imports {@link getPublicKey} from here instead of keeping its own copy.
 * Main exports: signAccessToken, signMfaToken, verifyMfaToken, decodeMfaTokenSubUnsafe,
 *   getPublicKey, ALGORITHM
 * Spec: docs/spec/09 §9.5 (Table 53 – access token), §9.7 (MFA challenge token)
 */
import { randomUUID } from 'node:crypto';
import { decodeJwt, errors, importPKCS8, importSPKI, jwtVerify, SignJWT, type CryptoKey } from 'jose';
import {
  ACCESS_TOKEN_TTL_SEC,
  ADMIN_ACCESS_TOKEN_TTL_SEC,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_MFA_AUDIENCE,
  MFA_TOKEN_TTL_MS,
  Role,
  type Role as RoleType,
} from '@campuscoin/shared';
import { config } from '../config/env.js';
import { unauthenticated } from './problem.js';

/** Fixed signing/verification algorithm — never negotiated, closes the "alg confusion" class of bugs. */
export const ALGORITHM = 'EdDSA';

let cachedPublicKey: CryptoKey | undefined;
let cachedPrivateKey: CryptoKey | undefined;

/** Imports (and caches) the Ed25519 public key used to verify access/MFA tokens. */
export async function getPublicKey(): Promise<CryptoKey> {
  cachedPublicKey ??= await importSPKI(config.auth.jwtPublicKey, ALGORITHM);
  return cachedPublicKey;
}

/** Imports (and caches) the Ed25519 private key used to sign access/MFA tokens. */
async function getPrivateKey(): Promise<CryptoKey> {
  cachedPrivateKey ??= await importPKCS8(config.auth.jwtPrivateKey, ALGORITHM);
  return cachedPrivateKey;
}

/** Input to {@link signAccessToken}. */
export interface SignAccessTokenInput {
  userId: string;
  role: RoleType;
  sessionId: string;
}

/** Result of {@link signAccessToken}/{@link signMfaToken}. */
export interface SignedToken {
  token: string;
  expiresIn: number;
}

/**
 * Signs a student/admin access token. Admin tokens get a shorter TTL than student tokens
 * (10 min vs 15 min) because the admin portal is higher-risk — the TTL is a fixed constant per
 * role, not read from `ACCESS_TOKEN_TTL` env, so it can't accidentally be widened per-environment.
 * @param input - userId (`sub`), role, sessionId (`sid`).
 * @returns The signed JWT and its lifetime in seconds.
 */
export async function signAccessToken(input: SignAccessTokenInput): Promise<SignedToken> {
  const expiresIn = input.role === Role.ADMIN ? ADMIN_ACCESS_TOKEN_TTL_SEC : ACCESS_TOKEN_TTL_SEC;
  const key = await getPrivateKey();
  const token = await new SignJWT({ role: input.role, sid: input.sessionId })
    .setProtectedHeader({ alg: ALGORITHM, kid: config.auth.jwtKid, typ: 'JWT' })
    .setSubject(input.userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(key);
  return { token, expiresIn };
}

/** Result of {@link signMfaToken}: the token, its `jti` (for single-use tracking) and TTL. */
export interface SignedMfaToken extends SignedToken {
  jti: string;
}

/**
 * Signs a short-lived MFA challenge token issued right after a successful password check, for
 * an admin account with TOTP enabled. It has its own audience ({@link JWT_MFA_AUDIENCE}) so it
 * can never be presented to `authenticate` as a normal access token.
 * @param input - userId (`sub`) of the account completing MFA.
 */
export async function signMfaToken(input: { userId: string }): Promise<SignedMfaToken> {
  const expiresIn = Math.floor(MFA_TOKEN_TTL_MS / 1000);
  const jti = randomUUID();
  const key = await getPrivateKey();
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM, kid: config.auth.jwtKid, typ: 'JWT' })
    .setSubject(input.userId)
    .setJti(jti)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_MFA_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(key);
  return { token, jti, expiresIn };
}

/** Payload extracted from a verified MFA token. */
export interface MfaTokenPayload {
  userId: string;
  jti: string;
}

/**
 * Verifies an MFA challenge token issued by {@link signMfaToken}.
 * @param token - The `mfaToken` string from the client.
 * @throws {AppError} 401 unauthenticated when missing, expired, malformed or wrong audience.
 */
export async function verifyMfaToken(token: string): Promise<MfaTokenPayload> {
  try {
    const key = await getPublicKey();
    const { payload } = await jwtVerify(token, key, {
      algorithms: [ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_MFA_AUDIENCE,
    });
    const { sub: userId, jti } = payload;
    if (typeof userId !== 'string' || typeof jti !== 'string') {
      throw unauthenticated('MFA token payload is malformed');
    }
    return { userId, jti };
  } catch (err) {
    if (err instanceof errors.JWTExpired) throw unauthenticated('MFA token has expired', 'token-expired');
    if (err && typeof err === 'object' && 'status' in err) throw err; // already an AppError above
    throw unauthenticated('Invalid MFA token');
  }
}

/**
 * Reads the `sub` claim out of an `mfaToken` **without verifying its signature** — used only to
 * pick a rate-limit bucket (security review 1c: keying the `/admin/auth/mfa/verify` limiter on
 * IP + `sub` closes brute force across a stream of *fresh* challenge tokens for the same admin,
 * which a hash-of-token key cannot do). Never use this result for authorization — an attacker can
 * put any `sub` in a token with a garbage signature; the real check is still `verifyMfaToken`.
 * @param token - The raw `mfaToken` string from the request body.
 * @returns The claimed `sub`, or `undefined` when the token is not even well-formed JSON/JWT.
 */
export function decodeMfaTokenSubUnsafe(token: string): string | undefined {
  try {
    const payload = decodeJwt(token);
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}
