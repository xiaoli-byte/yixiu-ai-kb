import { z } from "zod";

export const PaginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export const IdParam = z.object({
  id: z.string().min(1),
});
export type IdParam = z.infer<typeof IdParam>;

export const ApiResponse = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    ok: z.boolean(),
    data: data.optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .optional(),
  });