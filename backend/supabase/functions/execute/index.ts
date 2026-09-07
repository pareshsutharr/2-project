import { Hono } from "npm:hono@4.6.14";
import { cors } from "npm:hono@4.6.14/cors";
import { getExecuteDetails, getExecuteRows } from "../_shared/executeService.ts";

const app = new Hono().basePath("/execute");
app.use("*", cors());

app.get("/:scriptId", async (c) => {
  const scriptId = Number(c.req.param("scriptId"));
  const data = await getExecuteDetails(scriptId);
  if (!data) return c.json({ detail: "Script not found" }, 404);
  return c.json(data);
});

app.get("/:scriptId/rows", async (c) => {
  const scriptId = Number(c.req.param("scriptId"));
  const data = await getExecuteRows(scriptId);
  if (!data) return c.json({ detail: "Script not found" }, 404);
  return c.json(data);
});

Deno.serve(app.fetch);
