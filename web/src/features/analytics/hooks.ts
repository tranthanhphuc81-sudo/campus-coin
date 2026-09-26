import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";

import api from "@/lib/api";

const monthTrendSchema = z.object({
  month: z.string(),
  income: z.string(),
  expense: z.string(),
  net: z.string(),
});

const dashboardSummarySchema = z.object({
  greeting: z.object({
    message: z.string(),
    timezone: z.string(),
    localDate: z.string(),
  }),
  totals: z.object({
    income: z.string(),
    expense: z.string(),
    net: z.string(),
    vsPrevMonthPct: z.number().nullable(),
  }),
  topCategory: z
    .object({
      categoryId: z.number(),
      categoryName: z.string(),
      amount: z.string(),
      sharePct: z.number(),
      transactionCount: z.number(),
    })
    .nullable(),
  budgetVsActual: z.array(
    z.object({
      budgetId: z.number(),
      categoryId: z.number(),
      categoryName: z.string(),
      limitAmount: z.string(),
      spent: z.string(),
      percent: z.number(),
      level: z.enum(["ok", "near", "exceeded"]),
    }),
  ),
  categoryBreakdown: z.array(
    z.object({
      categoryId: z.number(),
      categoryName: z.string(),
      amount: z.string(),
      sharePct: z.number(),
      transactionCount: z.number(),
    }),
  ),
  trend6Months: z.array(monthTrendSchema),
  savingsGoalProgress: z.object({
    goalAmount: z.string(),
    netAmount: z.string(),
    progressPct: z.number(),
    status: z.enum(["not_set", "on_track", "behind"]),
  }),
  latestInsight: z
    .object({
      month: z.string(),
      summaryText: z.string(),
      tipText: z.string(),
      generator: z.enum(["llm", "template"]),
    })
    .nullable(),
  recentActivity: z.array(z.unknown()),
  activeAnnouncements: z.array(z.unknown()),
  tips: z.array(
    z.object({
      id: z.string(),
      ruleType: z.enum([
        "over_budget",
        "above_average",
        "small_frequent",
        "subscriptions",
        "savings_gap",
        "weekend_spike",
        "general",
      ]),
      categoryId: z.number().nullable(),
      title: z.string(),
      body: z.string(),
      impactAmount: z.string(),
      score: z.number(),
      status: z.enum(["active", "pinned"]),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

const categoryBreakdownSchema = z.object({
  filters: z.object({
    from: z.string(),
    to: z.string(),
    type: z.enum(["income", "expense"]),
    categoryId: z.number().nullable(),
  }),
  previousRange: z.object({ from: z.string(), to: z.string() }),
  totalAmount: z.string(),
  totalTransactions: z.number(),
  previousTotalAmount: z.string(),
  deltaAmount: z.string(),
  deltaPct: z.number().nullable(),
  items: z.array(
    z.object({
      categoryId: z.number(),
      categoryName: z.string(),
      amount: z.string(),
      sharePct: z.number(),
      transactionCount: z.number(),
    }),
  ),
});

const incomeVsExpenseSchema = z.object({
  months: z.number(),
  data: z.array(monthTrendSchema),
});

const dailyWeeklySchema = z.object({
  month: z.string(),
  daily: z.array(
    z.object({
      date: z.string(),
      income: z.string(),
      expense: z.string(),
      net: z.string(),
    }),
  ),
  weekly: z.array(
    z.object({
      isoWeek: z.string(),
      weekStartDate: z.string(),
      income: z.string(),
      expense: z.string(),
      net: z.string(),
    }),
  ),
  averageDailyExpense: z.string(),
});

const forecastItemSchema = z.object({
  categoryId: z.number(),
  categoryName: z.string(),
  type: z.enum(["income", "expense"]),
  predictedAmount: z.string(),
  lowerBound: z.string(),
  upperBound: z.string(),
  insufficientData: z.boolean(),
});

const forecastSchema = z.object({
  month: z.string(),
  insufficientData: z.boolean(),
  items: z.array(forecastItemSchema),
});

const recentActivitySchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      transactionId: z.string(),
      activityType: z.enum(["viewed", "edited"]),
      categoryName: z.string(),
      amount: z.string(),
      description: z.string().nullable(),
      txnDate: z.string(),
      createdAt: z.string(),
    }),
  ),
});

const wrappedDashboardSummarySchema = z.object({
  data: dashboardSummarySchema,
});

const wrappedCategoryBreakdownSchema = z.object({
  data: categoryBreakdownSchema,
});

const wrappedIncomeVsExpenseSchema = z.object({
  data: incomeVsExpenseSchema,
});

const wrappedDailyWeeklySchema = z.object({
  data: dailyWeeklySchema,
});

const wrappedForecastSchema = z.object({
  data: forecastSchema,
});

const wrappedRecentActivitySchema = z.object({
  data: recentActivitySchema,
});

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
export type CategoryBreakdownReport = z.infer<typeof categoryBreakdownSchema>;
export type IncomeVsExpenseReport = z.infer<typeof incomeVsExpenseSchema>;
export type DailyWeeklyReport = z.infer<typeof dailyWeeklySchema>;
export type NextMonthForecast = z.infer<typeof forecastSchema>;
export type RecentActivity = z.infer<typeof recentActivitySchema>;

type CategoryBreakdownFilters = {
  from: string;
  to: string;
  type: "income" | "expense";
  categoryId?: number;
};

export function dashboardSummaryQueryKey(month: string, timezone: string) {
  return ["dashboard", "summary", month, timezone] as const;
}

export function useDashboardSummary(month: string, timezone: string) {
  return useQuery({
    queryKey: dashboardSummaryQueryKey(month, timezone),
    queryFn: async () => {
      const response = await api.get("/dashboard/summary", {
        params: { month, timezone },
      });

      return wrappedDashboardSummarySchema.parse(response.data).data;
    },
    staleTime: 60_000,
  });
}

export function categoryBreakdownQueryKey(filters: CategoryBreakdownFilters) {
  return ["reports", "category-breakdown", filters] as const;
}

export function useCategoryBreakdownReport(filters: CategoryBreakdownFilters, enabled = true) {
  return useQuery({
    queryKey: categoryBreakdownQueryKey(filters),
    queryFn: async () => {
      const response = await api.get("/reports/category-breakdown", {
        params: {
          from: filters.from,
          to: filters.to,
          type: filters.type,
          categoryId: filters.categoryId,
        },
      });

      return wrappedCategoryBreakdownSchema.parse(response.data).data;
    },
    enabled,
  });
}

export function incomeVsExpenseQueryKey(months: number) {
  return ["reports", "income-vs-expense", months] as const;
}

export function useIncomeVsExpenseReport(months: number, enabled = true) {
  return useQuery({
    queryKey: incomeVsExpenseQueryKey(months),
    queryFn: async () => {
      const response = await api.get("/reports/income-vs-expense", {
        params: { months },
      });

      return wrappedIncomeVsExpenseSchema.parse(response.data).data;
    },
    enabled,
  });
}

export function dailyWeeklyQueryKey(month: string) {
  return ["reports", "daily-weekly", month] as const;
}

export function useDailyWeeklyReport(month: string, enabled = true) {
  return useQuery({
    queryKey: dailyWeeklyQueryKey(month),
    queryFn: async () => {
      const response = await api.get("/reports/daily-weekly", {
        params: { month },
      });

      return wrappedDailyWeeklySchema.parse(response.data).data;
    },
    enabled,
  });
}

export function nextMonthForecastQueryKey() {
  return ["forecast", "next-month"] as const;
}

export function useNextMonthForecast(enabled = true) {
  return useQuery({
    queryKey: nextMonthForecastQueryKey(),
    queryFn: async () => {
      const response = await api.get("/forecast/next-month");
      return wrappedForecastSchema.parse(response.data).data;
    },
    enabled,
  });
}

export function recentActivityQueryKey() {
  return ["activity", "recent"] as const;
}

export function useRecentActivity(enabled = true) {
  return useQuery({
    queryKey: recentActivityQueryKey(),
    queryFn: async () => {
      const response = await api.get("/activity/recent");
      return wrappedRecentActivitySchema.parse(response.data).data;
    },
    enabled,
  });
}

export async function exportMonthlyReportPdf(month: string): Promise<Blob> {
  const response = await api.get("/reports/monthly/export", {
    params: { month, format: "pdf" },
    responseType: "blob",
  });

  return response.data as Blob;
}

export function useShareMonthlyReport() {
  return useMutation({
    mutationFn: async (input: { month: string; toEmail: string }) => {
      const response = await api.post("/reports/monthly/share", input);
      return response.data as { data: { sent: boolean } };
    },
  });
}
