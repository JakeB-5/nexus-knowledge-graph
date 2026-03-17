import { Hono } from "hono";
import { z } from "zod";
import { MAX_SEARCH_QUERY_LENGTH } from "@nexus/shared";
import { zValidator } from "../middleware/validator.js";

export const searchRoutes = new Hono();

const searchBodySchema = z.object({
  query: z.string().min(1).max(MAX_SEARCH_QUERY_LENGTH),
  types: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
  semantic: z.boolean().default(false),
});

searchRoutes.post("/", zValidator("json", searchBodySchema), async (c) => {
  const body = c.req.valid("json" as never) as z.infer<typeof searchBodySchema>;

  // TODO: Implement with search engine
  return c.json({
    results: [],
    query: body.query,
    total: 0,
  });
});
