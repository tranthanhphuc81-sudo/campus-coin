import { z } from "zod";

export const tipIdParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, "id must be a positive integer."),
});
