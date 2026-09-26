import { z } from "zod";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export const insightMonthParamsSchema = z.object({
  month: z.string().regex(monthPattern, "month must use YYYY-MM format."),
});
