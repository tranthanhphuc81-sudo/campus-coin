# backend/data

Static data files bundled with the backend at runtime.

- `common-passwords.txt` — SecLists' `Passwords/Common-Credentials/10k-most-common.txt`
  (one password per line, plaintext, lower/mixed case as published). Source:
  https://github.com/danielmiessler/SecLists — MIT License. Used by
  `backend/src/lib/passwordPolicy.ts` to reject common passwords at registration /
  password-change time (BR-AU-02). Not a secret; safe to commit.
- `fonts/Roboto/*.ttf` — Google's Roboto font (Regular/Medium/Italic/MediumItalic), copied
  verbatim from `node_modules/pdfmake/fonts/Roboto/` (pdfmake bundles it for exactly this
  purpose). MIT-licensed (part of pdfmake's own distribution), includes Vietnamese diacritics.
  Used by `backend/src/integrations/pdf/fonts.ts` for the monthly report PDF export (P12,
  docs/spec/05b §5.8). Committed here (not read from `node_modules`) so PDF generation does not
  depend on pdfmake's internal file layout surviving a future upgrade. Not a secret; safe to commit.
