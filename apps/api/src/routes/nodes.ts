import { Hono } from "hono";
import { z } from "zod";
import { CreateNodeSchema, UpdateNodeSchema, PaginationSchema, NexusError } from "@nexus/shared";
import { zValidator } from "../middleware/validator.js";

export const nodeRoutes = new Hono();

const listQuerySchema = PaginationSchema.extend({
  type: z.string().optional(),
  search: z.string().max(500).optional(),
});

nodeRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const query = c.req.valid("query" as never) as z.infer<typeof listQuerySchema>;

  // TODO: Implement with db
  return c.json({
    items: [],
    total: 0,
    page: query.page ?? 1,
    limit: query.limit ?? 20,
    totalPages: 0,
  });
});

nodeRoutes.get("/:id", async (c) => {
  const nodeId = c.req.param("id");

  // TODO: Implement with db
  throw NexusError.notFound("Node", nodeId);
});

nodeRoutes.post("/", zValidator("json", CreateNodeSchema), async (c) => {
  const body = c.req.valid("json" as never) as z.infer<typeof CreateNodeSchema>;

  // TODO: Implement with db
  return c.json({ message: "Create node - pending db", ...body }, 201);
});

nodeRoutes.patch("/:id", zValidator("json", UpdateNodeSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json" as never) as z.infer<typeof UpdateNodeSchema>;

  // TODO: Implement with db
  return c.json({ message: "Update node - pending db", id, ...body });
});

nodeRoutes.delete("/:id", async (c) => {
  const _id = c.req.param("id");

  // TODO: Implement with db
  return c.body(null, 204);
});

// Edges for a specific node
nodeRoutes.get("/:id/edges", async (_c) => {
  // TODO: Implement with db
  return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
});
