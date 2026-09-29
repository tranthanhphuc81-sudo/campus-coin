# Sample CSV files (P17)

Sample files for demoing the CSV import wizard (docs/spec/05a §5.5).

- `transactions-sample.csv` — 200 valid rows, one column layout (`date,amount,type,description,category`),
  ISO dates (`YYYY-MM-DD`), a mix of English and Vietnamese descriptions. Imports cleanly with the
  wizard's default auto-detected column mapping.
- `transactions-with-errors.csv` — a small file demonstrating the wizard's per-row error reporting:
  a missing `description`/`category` (row 2), a non-numeric `amount` (row 3), an impossible calendar
  date `31/02/2026` (row 4), a cell containing a raw spreadsheet formula
  `=HYPERLINK("http://evil.example","x")` (row 5) to demonstrate the CSV-safe-export/formula-injection
  defence (docs/spec/12 TC-19 — the wizard must neutralise this on preview/export, never execute it),
  and a duplicate row (rows 6–7) to demonstrate duplicate-row detection.
