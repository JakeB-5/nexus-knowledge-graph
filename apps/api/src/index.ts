import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { getEnv } from "./env.js";

const env = getEnv();

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Nexus API running on http://localhost:${info.port}`);
  },
);
