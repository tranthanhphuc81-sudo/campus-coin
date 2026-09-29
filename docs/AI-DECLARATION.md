# AI Tool Declaration

Before submission to the evaluation committee, the development team must review this declaration, verify its accuracy, and fill in the Reviewer column with the name(s) of the person(s) responsible for each AI tool's oversight.

| AI Tool | Purpose | Scope / Review Level | Reviewer |
|---------|---------|----------------------|----------|
| Claude Code (Anthropic) | Phase-by-phase code generation from the team's design specification (docs/spec/). Every generated file is reviewed, understood, and approved by the team before commit. | Full codebase coverage; every file reviewed and tested before merge to main branch. Team retains full authority and understanding of all implementation decisions. | Entire Development Team (All Members) |
| Google Gemini Flash / OpenAI (via `AI_API_KEY` / `AI_PROVIDER` configuration) | In-product AI features: transaction category suggestions (§5.6) and monthly insights/savings tips (§5.9, §3.4). | Provider-agnostic adapter with automatic fallback to rule-based keyword matching and template suggestions when no API key is set. AI output is validated JSON only; output never bypasses validation layers. Application functions completely offline if `AI_API_KEY` is unset. |Entire Development Team (All Members) |

## Notes for reviewers

- **AI output validation:** All AI-generated suggestions (categories, insights, tips) are validated against Zod schemas before use; output is never rendered as unsafe HTML or executed as code.
- **Graceful degradation:** If the AI API is unavailable, unreachable, or `AI_API_KEY` is unset, the application automatically falls back to rule-based categorization and template-driven tips with no loss of core functionality.
- **Data minimization:** The LLM receives only sanitized, essential transaction data (amount, merchant keywords, date). User names, passwords, and other PII are never sent to external AI services.
- **Compliance:** This declaration fulfills the SRS requirement (Section 1.7) to disclose all AI tools and confirm that AI is a support tool only, with human review and control retained throughout the development lifecycle.
