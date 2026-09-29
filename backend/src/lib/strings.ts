/**
 * strings.ts
 * Small string helpers shared across modules. `truncate` is used before writing any
 * client-controlled string (User-Agent, action code, entity id) into a fixed-width DB column, so
 * an oversized value never causes a DB error and can never be used to push earlier bytes of an
 * audit row out of a log line / truncate silently in a way that hides evidence (security review
 * finding: a very long User-Agent must not be able to evade or corrupt the audit trail).
 * `sanitizeFilename` (P11) neutralises a client-supplied upload filename before it is stored or
 * ever echoed back in a header/UI (path traversal, control chars, bidi override tricks).
 * Main exports: truncate, sanitizeFilename
 * Spec: docs/spec/09 §9.12 (Table 58 – audit log column widths) · §9.10 (file upload safety)
 */

/**
 * Truncates `value` to at most `maxLength` characters. `undefined` stays `undefined` so optional
 * fields don't turn into the literal string `"undefined"`.
 * @param value - Raw string, or `undefined` when the caller has none.
 * @param maxLength - Maximum number of characters to keep.
 */
export function truncate(value: string | undefined, maxLength: number): string | undefined {
  return value === undefined ? undefined : value.slice(0, maxLength);
}

/** Windows/POSIX reserved filename characters, replaced with `_`. */
// eslint-disable-next-line no-control-regex -- deliberately matching the reserved character class, not C0 controls.
const RESERVED_FILENAME_CHARS = /[<>:"/\\|?*]/g;
/** C0 (0x00-0x1F) and C1 (0x7F-0x9F) control characters, stripped outright. */
// eslint-disable-next-line no-control-regex -- intentionally targets control characters.
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;
/** Unicode bidi-override characters (RTL/LTR override tricks to disguise a file extension). */
const BIDI_OVERRIDE_CHARS = /[‪-‮⁦-⁩]/g;
const MAX_FILENAME_LENGTH = 255;

/**
 * Sanitises a client-supplied upload filename (BR: never trust/echo the raw `originalname`):
 * takes the basename after the last `/`/`\` (defeats path traversal), Unicode-normalises (NFC),
 * strips control/bidi-override characters, replaces reserved characters with `_`, collapses
 * whitespace, trims leading/trailing dots/spaces, and caps the result at 255 characters.
 * @param name - Raw filename from the client (e.g. `multer`'s `file.originalname`).
 * @param fallback - Returned when sanitising leaves nothing usable (default `'import.csv'`).
 */
export function sanitizeFilename(name: string, fallback = 'import.csv'): string {
  const basename = name.split(/[/\\]/).pop() ?? '';
  const cleaned = basename
    .normalize('NFC')
    .replace(BIDI_OVERRIDE_CHARS, '')
    .replace(CONTROL_CHARS, '')
    .replace(RESERVED_FILENAME_CHARS, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, MAX_FILENAME_LENGTH);

  return cleaned.length > 0 ? cleaned : fallback;
}
