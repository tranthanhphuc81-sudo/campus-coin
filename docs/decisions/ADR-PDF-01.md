# ADR-PDF-01: Monthly PDF Export with Charts (Server-side, pdfmake)

- **Status:** Accepted
- **Date:** 2026-09-26
- **Decision Maker:** Entire Development Team (All Members)
- **Draft Prompt:** p8-3a-pdf-decide, GitHub Copilot (Claude Sonnet 5)

## Context

Section 5.8 of `docs/spec/05b-ai-dashboard-reports-insights-tips.md` defines the server-generated monthly PDF. The current implementation renders a title/summary, a category-breakdown horizontal bar table, top transactions, an available insight summary, and a disclaimer. It does not currently render the originally proposed category doughnut or six-month income-versus-expense chart. This ADR records the shipped implementation and that remaining scope gap.

The PDF is built server-side with `pdfmake` from report-service data. Category bars use pdfmake's vector `canvas` rectangles inside table cells. Client-uploaded chart images and native canvas/chart rendering are not used.

## Decisions

### 1. Chart rendering approach inside PDF

### 1. PDF chart rendering approach

| Option | Pros | Cons |
|---|---|---|
| A. `chartjs-node-canvas` | Reuses frontend Chart.js configuration | Requires native canvas/system libraries and increases Alpine image/CI complexity |
| B. TypeScript-generated SVG embedded by pdfmake | Server-generated and predictable without a native addon | Requires custom SVG geometry and layout |
| C. Client-rendered image upload | Low initial server implementation effort | Adds an upload attack surface and weakens report integrity |
| D. pdfmake table with vector `canvas` primitives | No new renderer or native addon; labels remain normal PDF text; fits the current category breakdown | Limited to simple inline bars; not a doughnut or grouped time-series chart |

**Implemented choice:** D for the current category-breakdown visualization. The report service supplies the data, and the PDF module draws proportional horizontal rectangles in table cells. It does not accept client-uploaded images. The category doughnut and six-month grouped bars from the original design remain unimplemented and must not be claimed as included in the current PDF.

### 2. Font strategy

Roboto TTF files are packaged under `backend/data/fonts/Roboto/` and registered on the shared pdfmake instance by `configurePdfMake()`. The current files are `Roboto-Regular.ttf`, `Roboto-Medium.ttf`, `Roboto-Italic.ttf`, and `Roboto-MediumItalic.ttf`; the bold styles map to the bundled Medium faces. The document uses `defaultStyle.font = "Roboto"`.

Category names, labels, and other user-visible text are regular pdfmake text nodes, not text embedded in vector graphics. The font/resource policy restricts local access to the bundled font directory and blocks URL access.

## Implementation Status

The API dependency, bundled Roboto font assets, server-side report rendering, PDF download headers, and category horizontal-bar table are implemented. The PDF module does not contain SVG builders. The category doughnut and six-month grouped income/expense chart remain gaps relative to the original report design. Do not treat this ADR as evidence that those charts have shipped.

## Team Edits vs AI Draft

- The implementation keeps PDF data and drawing server-side and rejects client-uploaded chart images. For the current category visualization it uses pdfmake-native vector rectangles in a table rather than SVG or a native chart renderer.
- **Concrete example:** Each category row's bar width is calculated from the server-provided amount and drawn with a pdfmake `canvas` rectangle; category names remain ordinary PDF text.
