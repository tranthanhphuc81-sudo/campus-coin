/**
 * fonts.test.ts
 * Unit test for `isWithinFontsDir` (backend/src/integrations/pdf/fonts.ts, C-L7): the
 * `pdfmake` local-access policy must reject a path-traversal escape and a same-prefix sibling
 * directory, not just do a naive `startsWith` string check.
 * Spec: docs/security/review-p19.md C-L7
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isWithinFontsDir } from '../../../src/integrations/pdf/fonts.js';

// Mirrors fonts.ts's own resolution (relative to that file, not `process.cwd()`, so this test is
// independent of how the test runner was invoked): backend/tests/unit/pdf -> backend/data/fonts.
const FONTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'fonts');

describe('isWithinFontsDir', () => {
  it('accepts a real font file inside FONTS_DIR', () => {
    expect(isWithinFontsDir(path.join(FONTS_DIR, 'Roboto', 'Roboto-Regular.ttf'))).toBe(true);
  });

  it('accepts FONTS_DIR itself', () => {
    expect(isWithinFontsDir(FONTS_DIR)).toBe(true);
  });

  it('rejects a path-traversal escape out of FONTS_DIR', () => {
    expect(isWithinFontsDir(path.join(FONTS_DIR, '..', '..', 'etc', 'passwd'))).toBe(false);
  });

  it('rejects a same-prefix sibling directory (not a real subdirectory)', () => {
    expect(isWithinFontsDir(`${FONTS_DIR}-evil${path.sep}secret.ttf`)).toBe(false);
  });
});
