import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
  real,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.js";
import { edges } from "./edges.js";

export const nodeTypeEnum = pgEnum("node_type", [
  "document",
  "concept",
  "tag",
  "person",
  "organization",
  "event",
  "location",
  "resource",
]);

export const nodes = pgTable(
  "nodes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: nodeTypeEnum("type").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    content: text("content"),
    metadata: jsonb("metadata").default({}).notNull(),
    embedding: real("embedding").array(),
    ownerId: uuid("owner_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("nodes_type_idx").on(table.type),
    index("nodes_owner_idx").on(table.ownerId),
    index("nodes_created_at_idx").on(table.createdAt),
  ],
);

export const nodeRelations = relations(nodes, ({ one, many }) => ({
  owner: one(users, {
    fields: [nodes.ownerId],
    references: [users.id],
  }),
  outgoingEdges: many(edges, { relationName: "sourceNode" }),
  incomingEdges: many(edges, { relationName: "targetNode" }),
}));
