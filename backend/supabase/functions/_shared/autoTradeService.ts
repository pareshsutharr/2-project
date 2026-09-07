import { d } from "./decimal.ts";
import { addExecuteRow, updateExecuteRow, NoSlotAvailableError, ZeroQtyError, type ExecuteRow } from "./executeService.ts";
import { sendTelegramMessage } from "./telegramAlerts.ts";
import * as tl from "./triggerLifecycle.ts";
import { indiaTimeStr, indiaWeekday } from "./wallclock.ts";
import type { Script } from "./scriptService.ts";
import { sql } from "./db.ts";

const MARKET_OPEN = "09:15:00";
const MARKET_CLOSE = "15:30:00";

export function isMarketOpenNow(now: Date = new Date()): boolean {
  if (indiaWeekday(now) >= 5) return false; // Saturday=5, Sunday=6
  const t = indiaTimeStr(now);
  return t >= MARKET_OPEN && t <= MARKET_CLOSE;
}

async function autoSell(script: Script, row: ExecuteRow, price: number): Promise<void> {
  const updated = await updateExecuteRow(
    row.id,
    { trade_date: row.trade_date, trade_time: row.trade_time, buy_price: Number(row.buy_price), sell_price: price },
    false,
  );
  if (!updated || updated.sell_price === null || updated.sell_qty === null) return;
  const pnl = d(updated.sell_price).minus(d(updated.buy_price)).times(d(updated.sell_qty, 6)).toDecimalPlaces(2);
  await sendTelegramMessage(
    `🤖 AUTO-SELL executed\nScript: ${script.name}\nPrice: ${updated.sell_price}\nQty: ${updated.sell_qty}\nP&L: ${pnl}`,
  );
}

async function autoBuy(script: Script, price: number): Promise<void> {
  const now = new Date();
  const [y, m, dd] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-");
  const tradeDate = `${y}-${m}-${dd}`;
  const tradeTime = indiaTimeStr(now);
  let row: ExecuteRow | null;
  try {
    row = await addExecuteRow(script.id, { trade_date: tradeDate, trade_time: tradeTime, buy_price: price, sell_price: null }, false);
  } catch (e) {
    if (e instanceof NoSlotAvailableError || e instanceof ZeroQtyError) return;
    throw e;
  }
  if (!row) return;
  await sendTelegramMessage(`🤖 AUTO-BUY executed\nScript: ${script.name}\nPrice: ${row.buy_price}\nQty: ${row.buy_qty}`);
}

async function processScript(script: Script): Promise<void> {
  let { rows, current, buyTrigger } = await tl.prepareScriptTriggers(script);
  if (current === null) return;

  let openRows = rows.filter((r) => r.sell_price === null).sort((a, b) => (d(a.up_value).minus(d(b.up_value))).toNumber());
  let soldAny = false;
  for (const row of openRows) {
    if (current.gte(d(row.up_value))) {
      await autoSell(script, row, current.toNumber());
      soldAny = true;
    }
  }

  if (soldAny) {
    const refreshed = await tl.prepareScriptTriggers(script);
    rows = refreshed.rows;
    current = refreshed.current;
    buyTrigger = refreshed.buyTrigger;
    if (current === null) return;
    openRows = rows.filter((r) => r.sell_price === null);
  }

  // Don't open a new position once invest_slots concurrent positions are already held.
  if (openRows.length >= script.invest_slots) return;

  if (rows.length === 0) {
    // Fresh script, never traded: enter immediately at the current price instead of waiting
    // for a dip. This also creates that row's own buy/sell targets (up_value/down_value),
    // which then drive all subsequent auto-buy/auto-sell decisions.
    await autoBuy(script, current.toNumber());
  } else if (buyTrigger !== null && current.lte(buyTrigger)) {
    await autoBuy(script, current.toNumber());
  }
}

export async function runTick(): Promise<void> {
  if (!isMarketOpenNow()) return;
  const scripts = await sql<Script[]>`select * from scripts where active = true`;
  for (const script of scripts) {
    try {
      await processScript(script);
    } catch (e) {
      console.error(`Auto-trade tick failed for script ${script.id} (${script.name}):`, e);
    }
  }
}
