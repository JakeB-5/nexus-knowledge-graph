import { z } from "zod";

export const IdSchema = z.string().uuid();

export const TimestampsSchema = z.object({
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
  });

export const SortOrderSchema = z.enum(["asc", "desc"]).default("desc");

export type Id = z.infer<typeof IdSchema>;
export type Timestamps = z.infer<typeof TimestampsSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type SortOrder = z.infer<typeof SortOrderSchema>;
