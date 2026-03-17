import {
  pgTable,
  uuid,
  real,
  timestamp,
  jsonb,
  pgEnum,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { nodes } from "./nodes.js";

export const edgeTypeEnum = pgEnum("edge_type", [
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

export const edges = pgTable(
  "edges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: edgeTypeEnum("type").notNull(),
    sourceId: uuid("source_id")
      .references(() => nodes.id, { onDelete: "cascade" })
      .notNull(),
    targetId: uuid("target_id")
      .references(() => nodes.id, { onDelete: "cascade" })
      .notNull(),
    weight: real("weight").default(1).notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("edges_source_idx").on(table.sourceId),
    index("edges_target_idx").on(table.targetId),
    index("edges_type_idx").on(table.type),
    unique("edges_unique_typed").on(table.sourceId, table.targetId, table.type),
  ],
);

export const edgeRelations = relations(edges, ({ one }) => ({
  source: one(nodes, {
    fields: [edges.sourceId],
    references: [nodes.id],
    relationName: "sourceNode",
  }),
  target: one(nodes, {
    fields: [edges.targetId],
    references: [nodes.id],
    relationName: "targetNode",
  }),
}));
