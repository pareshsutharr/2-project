import { Hono } from "npm:hono@4.6.14";
import { cors } from "npm:hono@4.6.14/cors";
import { getMonitoring, getSummary } from "../_shared/dashboardService.ts";
import { withRetry } from "../_shared/retry.ts";

const app = new Hono().basePath("/dashboard");
app.use("*", cors());

app.get("/summary", async (c) => c.json(await withRetry(getSummary)));
app.get("/monitoring", async (c) => c.json(await withRetry(getMonitoring)));

app.onError((err, c) => {
  console.error("dashboard function error:", err);
  return c.json({ detail: "Temporarily unavailable, please retry." }, 503);
});

Deno.serve(app.fetch);
