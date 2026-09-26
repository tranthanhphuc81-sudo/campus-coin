import path from "node:path";

import PdfPrinter from "pdfmake";

// ADR-PDF-01: Roboto (Google Fonts, Apache-2.0) embeds its own Vietnamese glyph subset, so
// user-entered category/description text with Vietnamese diacritics renders correctly.
// Files are real .ttf (not .woff2) checked into the repo — never downloaded at runtime.
// NOTE: @foliojs-fork/fontkit (pdfkit's font engine) throws ERR_BUFFER_OUT_OF_BOUNDS while
// subsetting some Vietnamese composite glyphs when the source font is .woff2; plain .ttf avoids
// the WOFF2-decompress-then-resubset code path entirely and does not hit that bug.
const fontsDir = path.join(import.meta.dirname, "../../assets/fonts");

const fontDescriptors = {
  Roboto: {
    normal: path.join(fontsDir, "Roboto-Regular.ttf"),
    bold: path.join(fontsDir, "Roboto-Bold.ttf"),
    italics: path.join(fontsDir, "Roboto-Italic.ttf"),
    bolditalics: path.join(fontsDir, "Roboto-BoldItalic.ttf"),
  },
};

export const pdfPrinter = new PdfPrinter(fontDescriptors);

export const PDF_DEFAULT_FONT = "Roboto";
