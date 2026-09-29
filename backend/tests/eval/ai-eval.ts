/**
 * ai-eval.ts
 * Quality-measurement CLI for tier-2 (keyword) + tier-3 (LLM) categorization, run against
 * `tests/fixtures/categorization-100.json`. Uses ONLY the pure pieces (`matchKeyword` +
 * `classifyWithLlm(getAiProvider(), ...)`) — no DB/Redis, ignores the daily quota. Not matched by
 * vitest's `*.test.ts` glob and not shipped in `dist/`; it is a report, not a test, so it always
 * exits 0 regardless of whether the pipeline hits its accuracy target.
 * Usage: `npm run ai:eval -w backend [-- --no-llm | --llm-all]`
 * Main exports: none (CLI entry point)
 * Spec: docs/spec/05b (AI categorization) · Verification target: pipeline (tier2->tier3) accuracy >= 85%
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TransactionType } from '@campuscoin/shared';
import { DEFAULT_CATEGORIES } from '../../prisma/seed/data/categories.js';
import { config } from '../../src/config/env.js';
import { AiProviderError } from '../../src/integrations/ai/errors.js';
import { getAiProvider, PROMPT_VERSION } from '../../src/integrations/ai/index.js';
import { matchKeyword } from '../../src/modules/ai/ai.keywords.js';
import { classifyWithLlm } from '../../src/modules/ai/ai.llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** One entry of the fixture file. */
interface FixtureItem {
  description: string;
  type: TransactionType;
  expected: string;
  lang: string;
}

/** Shape of `categorization-100.json`. */
interface Fixture {
  version: number;
  description: string;
  items: FixtureItem[];
}

/** One reported misclassification. */
interface Miss {
  description: string;
  expected: string;
  got: string | null;
  tier: 'tier2' | 'tier3';
}

const PIPELINE_TARGET_PCT = 85;
const MAX_MISSES_SHOWN = 20;

/** Parses the two flags this script accepts. */
function parseFlags(argv: string[]): { noLlm: boolean; llmAll: boolean } {
  return { noLlm: argv.includes('--no-llm'), llmAll: argv.includes('--llm-all') };
}

/** Default category names of one type (income/expense) — the allow-list a lookup is restricted to. */
function namesByType(type: TransactionType): string[] {
  return DEFAULT_CATEGORIES.filter((c) => c.type === type).map((c) => c.name);
}

/** Groups fixture items by `type` (the allowed category list is type-specific). */
function groupByType(items: FixtureItem[]): Map<TransactionType, FixtureItem[]> {
  const groups = new Map<TransactionType, FixtureItem[]>();
  for (const item of items) {
    const list = groups.get(item.type) ?? [];
    list.push(item);
    groups.set(item.type, list);
  }
  return groups;
}

async function main(): Promise<void> {
  const { noLlm, llmAll } = parseFlags(process.argv.slice(2));
  const fixturePath = path.join(__dirname, '../fixtures/categorization-100.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Fixture;

  const provider = getAiProvider();
  const hasLlm = !noLlm && provider.enabled;
  const misclassifications: Miss[] = [];

  console.log('=== CampusCoin AI categorization quality report ===');
  console.log(`Fixture version: ${fixture.version} (${fixture.items.length} items)`);
  console.log(`Prompt version: ${PROMPT_VERSION}`);
  console.log(`Provider: ${hasLlm ? `${config.ai.provider} (${config.ai.model})` : 'none (AI_API_KEY empty)'}`);
  console.log('');

  console.log('Tier 1 (personal rules): n/a — needs per-user correction history (covered by TC-16 integration test).');
  console.log('');

  // ---- Tier 2 (keyword dictionary) -----------------------------------------------------------
  const tier2Results = fixture.items.map((item) => ({
    item,
    got: matchKeyword(item.description, new Set(namesByType(item.type))),
  }));
  const tier2Answered = tier2Results.filter((r) => r.got !== null);
  const tier2Correct = tier2Answered.filter((r) => r.got === r.item.expected);
  for (const r of tier2Answered) {
    if (r.got !== r.item.expected) misclassifications.push({ description: r.item.description, expected: r.item.expected, got: r.got, tier: 'tier2' });
  }
  console.log(`Tier 2 (keyword dictionary): answered ${tier2Answered.length}/${fixture.items.length}, precision ${tier2Correct.length}/${tier2Answered.length || 1}`);

  // ---- Tier 3 on tier-2 misses ----------------------------------------------------------------
  const tier2Misses = tier2Results.filter((r) => r.got === null).map((r) => r.item);
  let tier3Answered = 0;
  let tier3Correct = 0;

  if (!hasLlm) {
    console.log('Tier 3 on tier-2 misses: skipped (no AI_API_KEY configured / --no-llm).');
  } else if (tier2Misses.length === 0) {
    console.log('Tier 3 on tier-2 misses: skipped (tier 2 answered everything).');
  } else {
    for (const [type, items] of groupByType(tier2Misses)) {
      const allowedNames = namesByType(type);
      const texts = items.map((i) => i.description);
      try {
        const results = await classifyWithLlm(provider, type, allowedNames, texts, { timeoutMs: config.ai.timeoutMs });
        results.forEach((res, idx) => {
          // `idx` only ever iterates this same-length `items`/`results` pair, never client input.
          // eslint-disable-next-line security/detect-object-injection
          const item = items[idx]!;
          if (!res) return;
          tier3Answered++;
          if (res.category === item.expected) tier3Correct++;
          else misclassifications.push({ description: item.description, expected: item.expected, got: res.category, tier: 'tier3' });
        });
      } catch (err) {
        const kind = err instanceof AiProviderError ? err.kind : 'unknown';
        console.log(`  (tier 3 call failed for type=${type}: ${kind} — treated as no answer for this chunk)`);
      }
    }
    console.log(`Tier 3 on tier-2 misses: answered ${tier3Answered}/${tier2Misses.length}, precision ${tier3Correct}/${tier3Answered || 1}`);
  }
  console.log('');

  // ---- Pipeline (tier2 -> tier3) accuracy -----------------------------------------------------
  const pipelineCorrect = tier2Correct.length + tier3Correct;
  const pipelineAccuracyPct = Math.round((pipelineCorrect / fixture.items.length) * 100);
  const pipelinePass = pipelineAccuracyPct >= PIPELINE_TARGET_PCT;
  console.log(
    `Pipeline (tier2 -> tier3) accuracy: ${pipelineCorrect}/${fixture.items.length} (${pipelineAccuracyPct}%) vs ${PIPELINE_TARGET_PCT}% target -> ${pipelinePass ? 'PASS' : 'FAIL'}`,
  );
  console.log('');

  // ---- Optional: LLM-only accuracy on ALL 100 items -------------------------------------------
  if (llmAll) {
    if (!hasLlm) {
      console.log('LLM-only accuracy on all 100: skipped (no AI_API_KEY configured).');
    } else {
      let llmOnlyAnswered = 0;
      let llmOnlyCorrect = 0;
      for (const [type, items] of groupByType(fixture.items)) {
        const allowedNames = namesByType(type);
        const texts = items.map((i) => i.description);
        try {
          const results = await classifyWithLlm(provider, type, allowedNames, texts, { timeoutMs: config.ai.timeoutMs });
          results.forEach((res, idx) => {
            if (!res) return;
            llmOnlyAnswered++;
            // `idx` only ever iterates this same-length `items`/`results` pair, never client input.
            // eslint-disable-next-line security/detect-object-injection
            if (res.category === items[idx]!.expected) llmOnlyCorrect++;
          });
        } catch (err) {
          const kind = err instanceof AiProviderError ? err.kind : 'unknown';
          console.log(`  (LLM-only call failed for type=${type}: ${kind})`);
        }
      }
      console.log(`LLM-only accuracy on all 100: answered ${llmOnlyAnswered}/100, correct ${llmOnlyCorrect}/${llmOnlyAnswered || 1}`);
    }
    console.log('');
  }

  // ---- Misclassifications ---------------------------------------------------------------------
  if (misclassifications.length > 0) {
    console.log(`Misclassifications (up to ${MAX_MISSES_SHOWN} of ${misclassifications.length}):`);
    for (const miss of misclassifications.slice(0, MAX_MISSES_SHOWN)) {
      console.log(`  "${miss.description}" -> expected ${miss.expected}, got ${miss.got ?? 'null'} (${miss.tier})`);
    }
  } else {
    console.log('No misclassifications.');
  }
}

main().catch((err: unknown) => {
  // Report script — an unexpected failure is printed, never a non-zero exit / thrown crash.
  console.error('[ai-eval] unexpected error:', err);
});
