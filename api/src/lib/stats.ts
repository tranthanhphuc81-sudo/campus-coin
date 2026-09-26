export function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((acc, value) => acc + value, 0);
  return total / values.length;
}

export function stddev(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const avg = mean(values);
  const variance =
    values.reduce((acc, value) => {
      const delta = value - avg;
      return acc + delta * delta;
    }, 0) / values.length;

  return Math.sqrt(variance);
}

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    const left = sorted[mid - 1] ?? 0;
    const right = sorted[mid] ?? 0;
    return (left + right) / 2;
  }

  return sorted[mid] ?? 0;
}

export function levenshtein(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previous = new Array<number>(right.length + 1);
  const current = new Array<number>(right.length + 1);

  for (let j = 0; j <= right.length; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + substitutionCost,
      );
    }

    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j] ?? 0;
    }
  }

  return previous[right.length] ?? 0;
}

export function weightedForecast(
  monthMinus1: number,
  monthMinus2: number,
  monthMinus3: number,
): number {
  return monthMinus1 * 0.5 + monthMinus2 * 0.3 + monthMinus3 * 0.2;
}
