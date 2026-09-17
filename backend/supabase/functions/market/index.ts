import { Hono } from "npm:hono@4.6.14";
import { cors } from "npm:hono@4.6.14/cors";
import { fetchNifty50Quote, fetchSensexQuote } from "../_shared/marketService.ts";

const app = new Hono().basePath("/market");
app.use("*", cors());

app.get("/nifty", async (c) => {
  const { value, changePercent } = await fetchNifty50Quote();
  return c.json({ value, change_percent: changePercent });
});

app.get("/sensex", async (c) => {
  const { value, changePercent } = await fetchSensexQuote();
  return c.json({ value, change_percent: changePercent });
});

Deno.serve(app.fetch);
