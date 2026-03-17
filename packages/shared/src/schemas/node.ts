import { z } from "zod";
import { IdSchema, TimestampsSchema } from "./common.js";

export const NodeTypeSchema = z.enum([
  "document",
  "concept",
  "tag",
  "person",
  "organization",
  "event",
  "location",
  "resource",
]);

export const NodeMetadataSchema = z.record(z.string(), z.unknown());

export const NodeSchema = z
  .object({
    id: IdSchema,
    type: NodeTypeSchema,
    title: z.string().min(1).max(500),
    content: z.string().max(100_000).optional(),
    metadata: NodeMetadataSchema.default({}),
    embedding: z.array(z.number()).optional(),
    ownerId: IdSchema,
  })
  .merge(TimestampsSchema);

export const CreateNodeSchema = NodeSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  embedding: true,
});

export const UpdateNodeSchema = CreateNodeSchema.partial().omit({
  ownerId: true,
});

export type NodeType = z.infer<typeof NodeTypeSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type CreateNode = z.infer<typeof CreateNodeSchema>;
export type UpdateNode = z.infer<typeof UpdateNodeSchema>;
