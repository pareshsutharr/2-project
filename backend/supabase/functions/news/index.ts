import { Hono } from "npm:hono@4.6.14";
import { cors } from "npm:hono@4.6.14/cors";
import { fetchStockNews, NewsFetchError } from "../_shared/newsService.ts";

const app = new Hono().basePath("/news");
app.use("*", cors());

app.get("/:symbol", async (c) => {
  const clean = c.req.param("symbol").trim().toUpperCase();
  if (!clean || clean.length > 50) return c.json({ detail: "Invalid symbol" }, 400);
  try {
    const items = await fetchStockNews(clean);
    return c.json({ symbol: clean, items });
  } catch (e) {
    if (e instanceof NewsFetchError) return c.json({ detail: "Could not fetch news right now" }, 502);
    throw e;
  }
});

Deno.serve(app.fetch);
