import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { NexusError } from "@nexus/shared";
import { nodeRoutes } from "./routes/nodes.js";
import { edgeRoutes } from "./routes/edges.js";
import { authRoutes } from "./routes/auth.js";
import { searchRoutes } from "./routes/search.js";
import { graphRoutes } from "./routes/graph.js";
import { healthRoutes } from "./routes/health.js";

export const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000",
    credentials: true,
  }),
);

// Routes
app.route("/api/health", healthRoutes);
app.route("/api/auth", authRoutes);
app.route("/api/nodes", nodeRoutes);
app.route("/api/edges", edgeRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/graph", graphRoutes);

// Global error handler
app.onError((err, c) => {
  if (err instanceof NexusError) {
    return c.json(err.toJSON(), err.statusCode as any);
  }

  console.error("Unhandled error:", err);
  return c.json(
    { code: "INTERNAL_ERROR", message: "Internal server error", statusCode: 500 },
    500,
  );
});

// 404
app.notFound((c) => {
  return c.json({ code: "NOT_FOUND", message: "Route not found", statusCode: 404 }, 404);
});
