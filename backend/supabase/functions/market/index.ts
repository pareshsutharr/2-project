import { Hono } from "npm:hono@4.6.14";
import { cors } from "npm:hono@4.6.14/cors";
import { fetchNifty50Quote } from "../_shared/marketService.ts";

const app = new Hono().basePath("/market");
app.use("*", cors());

app.get("/nifty", async (c) => {
  const { value, changePercent } = await fetchNifty50Quote();
  return c.json({ value, change_percent: changePercent });
});

Deno.serve(app.fetch);
