import { Hono } from "npm:hono@4.6.14";
import { cors } from "npm:hono@4.6.14/cors";
import { getMonitoring, getSummary } from "../_shared/dashboardService.ts";

const app = new Hono().basePath("/dashboard");
app.use("*", cors());

app.get("/summary", async (c) => c.json(await getSummary()));
app.get("/monitoring", async (c) => c.json(await getMonitoring()));

Deno.serve(app.fetch);
