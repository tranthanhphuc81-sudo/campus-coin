# ADR-INSIGHT-01: Monthly Insight Statistics and LLM Output Controls

- **Status:** Accepted
- **Date:** 2026-09-26
- **Decision Maker:** Entire Development Team (All Members)
- **Draft Prompt:** p11-1a-insights-decide, GitHub Copilot (Claude Sonnet 5)

## Context

Sections 5.9.1-5.9.3 of `docs/spec/05b-ai-dashboard-reports-insights-tips.md` require backend-computed statistics, safe LLM wording, and a deterministic fallback. This ADR records the implemented P13 pipeline and distinguishes prompt guidance from checks enforced in code.

## Decisions

### 1. Monthly insight snapshot contract

The service builds a repository-backed snapshot for one user and first-of-month `YYYY-MM-DD` value. The pure calculation is `buildInsightSnapshot`, not a database-reading `computeMonthStats` function.

Core formulas per category `c`:

- `cur(c)`: expense in target month.
- `avg3(c)`: average of prior months among `{month-1, month-2, month-3}` that actually contain transactions for `c`; requires at least 2 months, else `null`.
- `avg3(c)`: average of the prior three months that actually contain transactions for `c`; requires at least two such months, else `null`. Only categories with positive spending in the target month are evaluated.
- `g(c) = (cur(c) - avg3(c)) / avg3(c)` when `avg3(c)` exists.
- `absDiff(c) = |cur(c) - avg3(c)|`.

Flag condition:

- `g(c) >= 0.25` and
- `absDiff(c) >= max(ABS_FLOOR(currency), 0.05 * baselineAllowance)`.

If `baselineAllowance` is null, the second term is treated as 0.
If `baselineAllowance` is null, its percentage-based floor is 0. Growth and budget-exceeded checks are independent; new-category flags are also produced when there is prior expense history overall. The snapshot ranks eligible patterns by absolute severity, returns at most three, and appends the largest-expense pattern separately.

### 2. Currency-aware floors and money formatting

The growth noise floor is `max(flat currency floor, 5% of monthly allowance baseline)`. Current flat floors are USD `5` and VND `50000`; unknown currencies fall back to the USD floor. There is no `CURRENCY_MINOR_DIGITS` map. Monetary calculations use Decimal helpers and the project's currency formatting/validation rules. Savings rate is `null` when income is not positive.

The `largest_expense` pattern is the largest non-deleted expense transaction in the target month. It is not selected from `is_anomaly` rows and is not re-detected as an anomaly.

### 3. Actionable suggestion generation

For a primary growth pattern, the backend computes a weekly cap as `avg3 / 4.33`, rounded to two Decimal places; the deterministic fallback can use it in its tip text. There is no separate fixed category-substitution mapping. Other primary patterns use the generic deterministic tip.

### 4. Prompt and structured output

### 4. Prompt and structured output

The prompt requests concise, supportive English and JSON with `summary_text` and `tip_text`. It asks for no more than 120 combined words, but code does not count/enforce words; the hard output limit is 1100 combined characters. The insight provider timeout is the shared `INSIGHT_LLM_TIMEOUT_MS` constant (3000 ms), not an `AI_INSIGHT_TIMEOUT_MS` environment variable.

### 5. Anti-hallucination output validation pipeline

### 5. LLM output validation and fallback

The implementation validates JSON shape, combined character length, numeric grounding against backend-computed values (including defined rounded variants), and banned financial-product/gambling terms. It also rejects URLs, email addresses, bare domains, and angle brackets. It does not currently enforce a word-count limit or a Vietnamese-character/language guard; English is requested in the prompt. An `AiProviderError` from generation/validation causes deterministic template fallback and a completed insight with `generator = template`.

### 6. Deterministic fallback, jobs, and regeneration

The template fallback uses the highest-ranked non-`largest_expense` pattern when available, adds a savings sentence when a savings rate exists, and otherwise uses a stable-month message. A growth pattern with a weekly cap gets a matching cap tip; other cases use the generic tracking tip. There is no separate `savingsRatePct >= 20` fallback branch.

Monthly work is fanned out into one BullMQ job per eligible user. AI failures are caught and fall back without retrying the provider call. Unhandled job failures (for example, database errors) use BullMQ backoff at 2s, 8s, and 32s. A user-triggered regenerate increments `regenerate_count` atomically and is capped at three; regenerating a month with no existing insight row returns 404 rather than creating the first row on demand.

## Implementation Status

The P13 statistics snapshot, prompt builder, Gemini/OpenAI provider integration, numeric-grounding and content gates, deterministic fallback, per-user BullMQ fan-out/retry, and atomic regeneration limit are implemented and covered by unit/integration tests. The word limit is prompt-only, no language guard is implemented, and the provider timeout is 3 seconds; these are recorded above rather than listed as completed draft checklist items.

## Team Edits vs AI Draft

- The team introduced a strict anti-hallucination number-matching pipeline before accepting any LLM text.
- **Concrete example:** If the LLM mentions a number not present in `PromptStatsInput` (outside allowed tolerances), the output is rejected and replaced with a template response.
