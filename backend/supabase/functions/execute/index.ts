import { Hono } from "npm:hono@4.6.14";
import { cors } from "npm:hono@4.6.14/cors";
import { getExecuteDetails, getExecuteRows } from "../_shared/executeService.ts";
import { withRetry } from "../_shared/retry.ts";

const app = new Hono().basePath("/execute");
app.use("*", cors());

app.get("/:scriptId", async (c) => {
  const scriptId = Number(c.req.param("scriptId"));
  const data = await withRetry(() => getExecuteDetails(scriptId));
  if (!data) return c.json({ detail: "Script not found" }, 404);
  return c.json(data);
});

app.get("/:scriptId/rows", async (c) => {
  const scriptId = Number(c.req.param("scriptId"));
  const data = await withRetry(() => getExecuteRows(scriptId));
  if (!data) return c.json({ detail: "Script not found" }, 404);
  return c.json(data);
});

app.onError((err, c) => {
  console.error("execute function error:", err);
  return c.json({ detail: "Temporarily unavailable, please retry." }, 503);
});

Deno.serve(app.fetch);
