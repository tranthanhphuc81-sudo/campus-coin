import { describe, expect, it } from "vitest";

import { levenshtein, mean, median, stddev, weightedForecast } from "./stats.js";

describe("stats helpers", () => {
  it("computes mean and stddev for numeric samples", () => {
    const values = [10, 12, 14, 16, 18];

    expect(mean(values)).toBe(14);
    expect(stddev(values)).toBeCloseTo(2.8284, 4);
  });

  it("computes median for odd and even arrays", () => {
    expect(median([9, 1, 4])).toBe(4);
    expect(median([10, 2, 6, 4])).toBe(5);
  });

  it("computes Levenshtein distance", () => {
    expect(levenshtein("campus cafe", "campus caff")).toBe(1);
    expect(levenshtein("bus", "hostel")).toBeGreaterThan(2);
  });

  it("computes weighted forecast using 0.5/0.3/0.2", () => {
    expect(weightedForecast(100, 50, 25)).toBe(70);
  });
});
