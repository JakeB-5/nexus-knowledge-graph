import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { users } from "../schema/users.js";

type Db = PgDatabase<any, any, any>;

export async function createUser(
  db: Db,
  data: { email: string; name: string; passwordHash: string; role?: "admin" | "editor" | "viewer" },
) {
  const [user] = await db
    .insert(users)
    .values({
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash,
      role: data.role ?? "viewer",
    })
    .returning();
  return user!;
}

export async function getUserById(db: Db, id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function getUserByEmail(db: Db, email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

export async function updateUser(
  db: Db,
  id: string,
  data: Partial<{ name: string; role: "admin" | "editor" | "viewer"; avatarUrl: string }>,
) {
  const [user] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return user ?? null;
}

export async function deleteUser(db: Db, id: string) {
  const [user] = await db.delete(users).where(eq(users.id, id)).returning();
  return user ?? null;
}
