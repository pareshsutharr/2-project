import { Hono } from "npm:hono@4.6.14";
import { cors } from "npm:hono@4.6.14/cors";
import { listScripts } from "../_shared/scriptService.ts";
import { buildCalendar } from "../_shared/calendarService.ts";

const app = new Hono().basePath("/calendar");
app.use("*", cors());

app.get("/", async (c) => {
  const scripts = await listScripts();
  const rows = await buildCalendar(scripts.map((s) => [s.id, s.name] as [number, string]));
  return c.json({ rows });
});

Deno.serve(app.fetch);
