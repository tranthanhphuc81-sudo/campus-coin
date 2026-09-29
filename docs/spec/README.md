# CampusCoin – Technical Design Document (split by chapter)

Source: `CampusCoin_Tai_lieu_thiet_ke_ky_thuat_v1.0.docx` (Vietnamese).
Split into small files so Claude Code only reads the part it needs (saves tokens).
Diagrams are in `../diagrams/figNN.jpg` — open them only when a text section is not enough.

| File | Chapters | Read when working on |
|---|---|---|
| 01-overview.md | 1–2: scope, assumptions, actors, use cases, DFD | Rarely (context only) |
| 03-tech-stack.md | 3: stack, ADR-01..10, AI strategy | Scaffolding, AI |
| 04-architecture.md | 4: 3-tier, backend layers, frontend, deployment, jobs, domain events | Backend core, jobs, deploy |
| 05a-auth-profile-categories-transactions.md | 5.1–5.5: auth, profile, categories, transactions, recurring, CSV import | P04, P06, P07, P08, P11 |
| 05b-ai-dashboard-reports-insights-tips.md | 5.6–5.10: AI categorization, dashboard, reports/PDF, insights, tips | P09, P10, P12, P13 |
| 05c-budgets-bookmarks-admin-advanced-a11y.md | 5.11–5.15: budgets/alerts, bookmarks, admin, advanced UX, accessibility | P05, P09, P14, P15 |
| 06-database.md | 6: DB principles, ERD, data dictionary (18 tables), indexes, seed, retention | P02, any schema change |
| 07-api.md | 7: API conventions, RFC 9457 errors, all endpoints, rate limits | Every backend phase |
| 08-ui-design.md | 8: sitemap, design tokens, screens, responsive, WCAG, UI states | Every frontend phase |
| 09-security.md | 9: STRIDE, auth, RBAC, OWASP, headers, AI safety, files, audit, backup, privacy | P04, P10, P11, P16, P19 |
| 10-performance-deployment.md | 10–11: perf targets, cache, availability, envs, CI/CD, env vars, install, demo accounts | P03, P17, P20, P21 |
| 12-testing-plan.md | 12–13: test levels, TC-01..TC-28, test data, DoD, sprint plan, risks | P17, P18 |
| appendix-traceability.md | Appendix A–D: requirement → design → API → table → test | Final verification (P21) |

## Diagrams
fig01 Use case · fig02 Context · fig03 DFD-0 · fig04 DFD-1 · fig05 3-tier · fig06 Backend layers ·
fig07 Frontend components · fig08 Deployment · fig09 Seq register · fig10 Seq login/refresh ·
fig11 Seq reset password · fig12 Flow add txn + AI · fig13 Flow recurring · fig14 State txn lifecycle ·
fig15 Seq CSV import · fig16 Seq 3-tier categorize · fig17 Seq export/share report · fig18 Seq insights ·
fig19 State insight job · fig20 Flow tips engine · fig21 Flow budget alert · fig22 Flow admin login ·
fig23 ERD overview · fig24 ERD core finance · fig25 Sitemap · fig26 Defense in depth ·
fig27 Data classification · fig28 CI/CD pipeline · fig29 Sprint plan
