import { Hono } from "hono";
import { z } from "zod";
import { NexusError, LoginSchema } from "@nexus/shared";
import { zValidator } from "../middleware/validator.js";

export const authRoutes = new Hono();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200),
});

authRoutes.post("/register", zValidator("json", registerSchema), async (c) => {
  const body = c.req.valid("json" as never) as z.infer<typeof registerSchema>;

  // TODO: Implement with db and argon2
  return c.json(
    {
      message: "Registration endpoint - implementation pending database setup",
      email: body.email,
    },
    201,
  );
});

authRoutes.post("/login", zValidator("json", LoginSchema), async (c) => {
  const body = c.req.valid("json" as never) as z.infer<typeof LoginSchema>;

  // TODO: Implement with db, argon2, and jose
  return c.json({
    message: "Login endpoint - implementation pending database setup",
    email: body.email,
  });
});

authRoutes.post("/refresh", async (c) => {
  const body = await c.req.json<{ refreshToken: string }>();

  if (!body.refreshToken) {
    throw NexusError.validation("refreshToken is required");
  }

  // TODO: Implement token refresh
  return c.json({
    message: "Refresh endpoint - implementation pending",
  });
});
