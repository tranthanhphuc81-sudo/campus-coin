# ADR-AI-01: AI Adapter and Three-layer Category Classifier

- **Status:** Accepted
- **Date:** 2026-09-26
- **Decision Maker:** Entire Development Team (All Members)
- **Draft Prompt:** p9-1a-ai-decide, GitHub Copilot (Claude Sonnet 5)

## Context

`docs/spec/03-tech-stack.md`, `docs/spec/05b-ai-dashboard-reports-insights-tips.md`, and `docs/spec/09-security.md` define optional provider-based AI, three-tier categorization, privacy controls, and deterministic fallback behavior. Redis 7 is part of the deployed stack and is used for shared AI caching and quota counters. This ADR records the implementation shipped in P10/P13.

## Decisions

### 1. Provider abstraction and factory

The `AiProvider` interface isolates Gemini, OpenAI, and the disabled/Null provider from business modules. Provider selection is configuration-driven; business services do not import vendor SDKs. Providers expose `categorize(request)` and `writeInsight(stats)`. Categorization is batched and returns validated category names/confidences; the Null provider is disabled and causes callers to use local rules or deterministic fallback text.

### 2. Merchant key normalization

### 2. Merchant-key normalization

Normalization maps `đ` to `d`, applies Unicode NFD and strips combining marks, lowercases, replaces non-ASCII letters with spaces (thereby dropping digits and punctuation), removes the small configured stop-word set, joins tokens, and truncates to 100 characters. An empty result is `null` and skips personal-rule lookup. The accented keyword index is tried before the unaccented index to avoid common Vietnamese collisions.

### 3. Personal rules and corrections

Rule confidence is `0.95` when `hitCount >= 2`, otherwise `0.8`. No `consecutive_overrides` column is used. When a user corrects an existing rule, the first correction is stored as `pendingCategoryId`; a second identical correction promotes that category and resets the pending value. A choice matching the current rule reinforces it and clears a pending correction.

### 4. Global keyword layer matching

The tier-2 matcher uses token windows, not arbitrary substring matching, and supports ordered multi-token phrases. It tries the accented index first, then the unaccented index. Within an index, it searches longest phrase first and left-to-right; a phrase resolving to multiple allowed categories is treated as ambiguous rather than guessed. An unresolved match falls through to tier 3 when that path is enabled.

### 5. LLM safety and output constraints

Before categorization calls, descriptions are normalized/sanitized to remove PII-like values and are framed as untrusted data in the prompt. The provider receives only the allowed category names for the transaction type. Output is parsed and validated against the request's allowed categories; confidence below `0.5` is dropped and accepted confidence is capped at `0.9`.

Interactive categorization uses a 3-second provider timeout; batch categorization uses 15 seconds. Monthly insight generation has a 3-second provider timeout. AI/provider failures resolve to no suggestion or deterministic insight text and do not block transaction saving.

### 6. Redis cache and daily quota

Tier-3 results are cached in Redis. Positive entries live for seven days; negative/no-suggestion entries live for one day. The key is derived from the exact sanitized text sent to the provider and a version hash covering the prompt, transaction type, and sorted allowed category names. Cache hits do not consume quota.

Daily LLM-call usage is an atomic Redis counter keyed by user and UTC date, with a 48-hour TTL. Each actual provider call consumes quota: one call for an interactive suggestion, one per batch chunk (up to 50 distinct merchant keys), and one for insight generation. Quota is skipped when the limit is reached; Redis errors fail closed for the provider call while local categorization and template fallback remain available. There is no `ai_usage_daily` table or in-memory LRU cache.

### 7. Opt-in and failure behavior

Tiers 1 and 2 run locally. Tier 3 requires a currently active account, `aiOptIn = true`, an enabled provider, available quota, and a cache miss. The opt-in/status is re-checked immediately before provider calls, including each batch chunk and insight generation. Provider timeout, transport failure, invalid output, disabled AI, and quota exhaustion do not block transaction writes; categorization returns no suggestion and insight generation uses its deterministic template.

### 8. Admin-facing accuracy metric

### 8. AI acceptance metric

The admin overview reports `aiAcceptanceRate = ai_accepted / (ai_accepted + ai_overridden)`, or `null` when there are no such decisions. The counts use non-deleted transactions' server-derived `categorySource` values; transactions not categorized through AI are excluded. The provenance is derived when saving the transaction rather than trusting a client-supplied `categorySource`.

## Implementation Status

The three-tier classifier, Gemini/OpenAI/Null providers, sanitization, Redis cache and quota, rule-learning state machine, and opt-in gates are implemented and tested. No database migration is required for rule streaks or quota accounting. Redis is a required project service, but cache/quota failures have explicit fallback behavior.

## Team Edits vs AI Draft

- The implementation uses Redis, which is already a required shared service in the project stack, for cross-process cache and daily quota counters. The quota counter increments atomically and expires automatically; no per-user daily-usage table is present.
- **Concrete example:** `ai-quota:{userId}:{YYYY-MM-DD}` is incremented for each real provider call, while a cached categorization result returns without spending quota.
