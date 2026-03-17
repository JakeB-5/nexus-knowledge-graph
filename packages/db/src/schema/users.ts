import { pgTable, uuid, varchar, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { nodes } from "./nodes.js";

export const userRoleEnum = pgEnum("user_role", ["admin", "editor", "viewer"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: userRoleEnum("role").default("viewer").notNull(),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userRelations = relations(users, ({ many }) => ({
  nodes: many(nodes),
}));
