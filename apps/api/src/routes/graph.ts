import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../middleware/validator.js";

export const graphRoutes = new Hono();

const traverseBodySchema = z.object({
  maxDepth: z.number().int().positive().max(10).default(3),
  maxNodes: z.number().int().positive().max(1000).default(100),
  direction: z.enum(["outgoing", "incoming", "both"]).default("outgoing"),
  edgeTypes: z.array(z.string()).optional(),
});

graphRoutes.post(
  "/traverse/:startId",
  zValidator("json", traverseBodySchema),
  async (c) => {
    const startId = c.req.param("startId");
    const body = c.req.valid("json" as never) as z.infer<typeof traverseBodySchema>;

    // TODO: Implement with graph engine + db
    return c.json({
      startNode: startId,
      visited: [],
      paths: {},
      options: body,
    });
  },
);

graphRoutes.get("/shortest-path", async (c) => {
  const source = c.req.query("source");
  const target = c.req.query("target");

  if (!source || !target) {
    return c.json({ error: "source and target query params required" }, 400);
  }

  // TODO: Implement with graph engine + db
  return c.json({ path: null, source, target });
});

graphRoutes.get("/pagerank", async (c) => {
  const limit = Number(c.req.query("limit") ?? "20");

  // TODO: Implement with graph engine + db
  return c.json({ rankings: [], limit });
});

graphRoutes.get("/communities", async (c) => {
  // TODO: Implement with graph engine + db
  return c.json({ communities: [] });
});
