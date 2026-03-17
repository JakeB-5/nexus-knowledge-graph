import { Hono } from "hono";
import { CreateEdgeSchema, NexusError } from "@nexus/shared";
import { zValidator } from "../middleware/validator.js";
import type { z } from "zod";

export const edgeRoutes = new Hono();

edgeRoutes.post("/", zValidator("json", CreateEdgeSchema), async (c) => {
  const body = c.req.valid("json" as never) as z.infer<typeof CreateEdgeSchema>;

  // TODO: Implement with db
  return c.json({ message: "Create edge - pending db", ...body }, 201);
});

edgeRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  // TODO: Implement with db
  throw NexusError.notFound("Edge", id);
});

edgeRoutes.delete("/:id", async (c) => {
  const _id = c.req.param("id");

  // TODO: Implement with db
  return c.body(null, 204);
});
