import { z } from "zod";
import { IdSchema, TimestampsSchema } from "./common.js";

export const EdgeTypeSchema = z.enum([
  "references",
  "contains",
  "related_to",
  "created_by",
  "tagged_with",
  "belongs_to",
  "depends_on",
  "derived_from",
  "mentions",
  "collaborates_with",
]);

export const EdgeSchema = z
  .object({
    id: IdSchema,
    type: EdgeTypeSchema,
    sourceId: IdSchema,
    targetId: IdSchema,
    weight: z.number().min(0).max(1).default(1),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .merge(TimestampsSchema);

export const CreateEdgeSchema = EdgeSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type EdgeType = z.infer<typeof EdgeTypeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type CreateEdge = z.infer<typeof CreateEdgeSchema>;
