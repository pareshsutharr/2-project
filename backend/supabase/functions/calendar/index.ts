import { Hono } from "npm:hono@4.6.14";
import { cors } from "npm:hono@4.6.14/cors";
import { listScripts } from "../_shared/scriptService.ts";
import { buildCalendar } from "../_shared/calendarService.ts";
import { withRetry } from "../_shared/retry.ts";

const app = new Hono().basePath("/calendar");
app.use("*", cors());

app.get("/", async (c) => {
  const rows = await withRetry(async () => {
    const scripts = await listScripts();
    return await buildCalendar(scripts.map((s) => [s.id, s.name] as [number, string]));
  });
  return c.json({ rows });
});

app.onError((err, c) => {
  console.error("calendar function error:", err);
  return c.json({ detail: "Temporarily unavailable, please retry." }, 503);
});

Deno.serve(app.fetch);
