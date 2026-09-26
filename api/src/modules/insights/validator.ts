import type { PromptStatsInput } from "./types.js";

type ValidateSuccess = {
  ok: true;
};

type ValidateFailure = {
  ok: false;
  reason: string;
};

type ValidateResult = ValidateSuccess | ValidateFailure;

type GeneratedInsightText = {
  summaryText: string;
  tipText: string;
};

const bannedKeywordRegexes = [
  /\bloan\b/i,
  /\bborrow(ing)?\b/i,
  /\bdebt\b/i,
  /\bcredit card\b/i,
  /\bcredit score\b/i,
  /\binvest(ment|ing)?\b/i,
  /\bstock market\b/i,
  /\bstocks?\b/i,
  /\bshares?\b/i,
  /\bmutual fund\b/i,
  /\bcrypto(currency)?\b/i,
  /\bbitcoin\b/i,
  /\bethereum\b/i,
  /\bnft\b/i,
  /\bforex\b/i,
  /\bday trading\b/i,
  /\btrading\b/i,
  /\bleverage\b/i,
  /\bmargin\b/i,
  /\bbet(ting)?\b/i,
  /\bgambl(e|ing)\b/i,
  /\bcasino\b/i,
  /\blottery\b/i,
  /\bget rich quick\b/i,
  /\bguaranteed return\b/i,
  /\brisk[-\s]?free\b/i,
  /\bpyramid scheme\b/i,
  /\bmlm\b/i,
  /\bpayday loan\b/i,
  /\brefinance\b/i,
  /\bmortgage\b/i,
  /\binsurance policy\b/i,
  /\bfinancial advisor\b/i,
  /\btax advice\b/i,
  /\blegal advice\b/i,
];

const vietnameseCharsRegex =
  /[àáạảãăằắặẳẵâầấậẩẫèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const numberRegex = /-?\d[\d,.]*\d|-?\d/g;

function splitWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0).length;
}

function normalizeExtractedNumber(raw: string): number | null {
  if (/\d+,\d{2}$/.test(raw) && !raw.includes(".")) {
    const normalized = raw.replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const normalized = raw.replaceAll(",", "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractNumericTokens(text: string): number[] {
  const tokens = text.match(numberRegex) ?? [];
  const values: number[] = [];

  for (const token of tokens) {
    const parsed = normalizeExtractedNumber(token);
    if (parsed !== null) {
      values.push(parsed);
    }
  }

  return values;
}

function toAmount(value: string): number {
  return Number.parseFloat(value.replaceAll(",", ""));
}

function toAllowedNumbers(input: PromptStatsInput): {
  amounts: number[];
  percentages: number[];
  counts: number[];
} {
  const amounts: number[] = [toAmount(input.totalIncome), toAmount(input.totalExpense)];
  const percentages: number[] = [];

  if (input.savingsRatePct !== null) {
    percentages.push(input.savingsRatePct);
  }

  for (const pattern of input.topPatterns) {
    amounts.push(toAmount(pattern.curAmount), toAmount(pattern.avg3Amount));
    percentages.push(pattern.growthPct);
  }

  if (input.largestAnomaly) {
    amounts.push(toAmount(input.largestAnomaly.amount));
  }

  if (input.weeklyCapSuggestion) {
    amounts.push(toAmount(input.weeklyCapSuggestion.amount));
  }

  const counts = [
    input.topPatterns.length,
    ...Array.from({ length: input.topPatterns.length }, (_, index) => index + 1),
  ];

  return { amounts, percentages, counts };
}

function withinTolerance(value: number, targets: number[], tolerance: number): boolean {
  return targets.some((target) => Math.abs(target - value) <= tolerance);
}

export function validateInsightText(
  generated: GeneratedInsightText,
  input: PromptStatsInput,
): ValidateResult {
  const mergedText = `${generated.summaryText} ${generated.tipText}`.trim();

  if (!generated.summaryText.trim() || !generated.tipText.trim()) {
    return { ok: false, reason: "Missing summaryText or tipText." };
  }

  const words = splitWords(mergedText);
  if (words < 1 || words > 120) {
    return { ok: false, reason: "Word count must be between 1 and 120." };
  }

  if (bannedKeywordRegexes.some((regex) => regex.test(mergedText))) {
    return { ok: false, reason: "Contains banned financial advice keywords." };
  }

  if (vietnameseCharsRegex.test(mergedText)) {
    return { ok: false, reason: "Generated text must be English only." };
  }

  const extracted = extractNumericTokens(mergedText);
  const allowed = toAllowedNumbers(input);

  for (const value of extracted) {
    const asCount = Number.isInteger(value) && withinTolerance(value, allowed.counts, 0);
    const asPercentage = withinTolerance(value, allowed.percentages, 1);
    const moneyTolerance = input.currency.toUpperCase() === "VND" ? 1 : 0.01;
    const asAmount = withinTolerance(value, allowed.amounts, moneyTolerance);

    if (!asCount && !asPercentage && !asAmount) {
      return { ok: false, reason: `Detected out-of-snapshot number: ${value}` };
    }
  }

  return { ok: true };
}
