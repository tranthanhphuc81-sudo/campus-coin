/**
 * fonts.ts
 * Registers the Roboto font family (docs/spec/05b §5.8: "font Roboto hỗ trợ tiếng Việt") with the
 * shared `pdfmake` singleton, and locks down its file/URL access so a document definition can
 * never be tricked into reading an arbitrary local path or fetching a remote resource — the whole
 * PDF is server-built from data already computed in `reports.service.ts`, so it never needs to
 * reach outside `backend/data/fonts`.
 * Main exports: configurePdfMake, isWithinFontsDir
 * Spec: docs/spec/05b §5.8 (PDF export) · docs/spec/09 (no unrestricted local/URL access) ·
 *   docs/security/review-p19.md C-L7
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pdfMake from 'pdfmake';

const FONTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'fonts');
const ROBOTO_DIR = path.join(FONTS_DIR, 'Roboto');

let configured = false;

/**
 * C-L7: `path.resolve` first, then compare against `FONTS_DIR + path.sep` (not a plain
 * `startsWith(FONTS_DIR)`), so a traversal like `FONTS_DIR/../../x` or a same-prefix sibling
 * directory (`FONTS_DIR-evil`) can't pass a naive string-prefix check. No input reaches this from
 * outside the process today (defense in depth) — the whole PDF is server-built from data already
 * computed in `reports.service.ts`.
 * @param filePath - The path pdfmake wants to read a font/resource from.
 * @returns Whether `filePath` resolves to something inside {@link FONTS_DIR} (or is FONTS_DIR itself).
 */
export function isWithinFontsDir(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return resolved === FONTS_DIR || resolved.startsWith(FONTS_DIR + path.sep);
}

/** Registers the Roboto font + access policies on the shared `pdfmake` instance. Idempotent. */
export function configurePdfMake(): typeof pdfMake {
  if (!configured) {
    pdfMake.setFonts({
      Roboto: {
        normal: path.join(ROBOTO_DIR, 'Roboto-Regular.ttf'),
        bold: path.join(ROBOTO_DIR, 'Roboto-Medium.ttf'),
        italics: path.join(ROBOTO_DIR, 'Roboto-Italic.ttf'),
        bolditalics: path.join(ROBOTO_DIR, 'Roboto-MediumItalic.ttf'),
      },
    });
    pdfMake.setLocalAccessPolicy(isWithinFontsDir);
    pdfMake.setUrlAccessPolicy(() => false);
    configured = true;
  }
  return pdfMake;
}
