import { Hono } from "npm:hono@4.6.14";
import { cors } from "npm:hono@4.6.14/cors";
import * as scriptService from "../_shared/scriptService.ts";
import { symbolExistsOnNse } from "../_shared/marketService.ts";
import { decOut } from "../_shared/decimal.ts";
import type { Script } from "../_shared/scriptService.ts";

const app = new Hono().basePath("/scripts");
app.use("*", cors());

function serializeScript(row: Script) {
  return {
    id: row.id,
    name: row.name,
    up_percent: decOut(row.up_percent),
    down_percent: decOut(row.down_percent),
    total_invest_amount: decOut(row.total_invest_amount),
    invest_slots: row.invest_slots,
    max_buy: row.max_buy,
    active: row.active,
    created_at: row.created_at.toISOString(),
  };
}

function parseBody(body: Record<string, unknown>) {
  const name = String(body.name ?? "");
  if (!name.trim() || name.length > 50) {
    throw new Error("name must be 1-50 characters");
  }
  const upPercent = Number(body.up_percent);
  const downPercent = Number(body.down_percent);
  const totalInvestAmount = Number(body.total_invest_amount);
  const investSlots = Number(body.invest_slots);
  const maxBuy = Number(body.max_buy);
  if (!(upPercent > 0) || !(downPercent > 0) || !(totalInvestAmount > 0) || !(investSlots > 0) || !(maxBuy > 0)) {
    throw new Error("up_percent, down_percent, total_invest_amount, invest_slots, max_buy must be > 0");
  }
  return {
    name,
    up_percent: upPercent,
    down_percent: downPercent,
    total_invest_amount: totalInvestAmount,
    invest_slots: investSlots,
    max_buy: maxBuy,
    active: body.active === undefined ? true : Boolean(body.active),
  };
}

app.get("/", async (c) => {
  const rows = await scriptService.listScripts();
  return c.json(rows.map(serializeScript));
});

app.get("/validate", async (c) => {
  const name = (c.req.query("name") ?? "").trim();
  if (!name) return c.json({ error: "name is required" }, 400);
  const valid = await symbolExistsOnNse(name);
  return c.json({ valid });
});

app.post("/", async (c) => {
  let payload;
  try {
    payload = parseBody(await c.req.json());
  } catch (e) {
    return c.json({ detail: (e as Error).message }, 422);
  }
  try {
    const row = await scriptService.createScript(payload);
    return c.json(serializeScript(row), 201);
  } catch (e) {
    if (e instanceof scriptService.ScriptNotFoundOnNseError) {
      return c.json({ detail: "Script does not exist" }, 400);
    }
    throw e;
  }
});

app.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  let payload;
  try {
    payload = parseBody(await c.req.json());
  } catch (e) {
    return c.json({ detail: (e as Error).message }, 422);
  }
  try {
    const row = await scriptService.updateScript(id, payload);
    if (!row) return c.json({ detail: "Script not found" }, 404);
    return c.json(serializeScript(row));
  } catch (e) {
    if (e instanceof scriptService.ScriptNotFoundOnNseError) {
      return c.json({ detail: "Script does not exist" }, 400);
    }
    throw e;
  }
});

app.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const ok = await scriptService.deleteScript(id);
  if (!ok) return c.json({ detail: "Script not found" }, 404);
  return c.body(null, 204);
});

Deno.serve(app.fetch);
