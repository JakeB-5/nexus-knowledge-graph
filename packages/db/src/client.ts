import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

// Portable process.env access for Node.js environments
declare const process: { env: Record<string, string | undefined> };

let dbInstance: ReturnType<typeof drizzle> | null = null;

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export function getDb(connectionString?: string) {
  if (!dbInstance) {
    const connStr = connectionString ?? process.env["DATABASE_URL"];
    if (!connStr) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    dbInstance = createDb(connStr);
  }
  return dbInstance;
}

export { getDb as db };
