import { sql } from "./db.ts";
import { Decimal, d } from "./decimal.ts";
import { getQuoteCached } from "./marketService.ts";
import { combineDateTime, indiaTodayStr, utcInstantToNaiveIstString } from "./wallclock.ts";
import { fetchRowsForScript, type ExecuteRow } from "./executeRows.ts";
import type { Script } from "./scriptService.ts";

export type ScriptTriggerState = {
  script_id: number;
  post_sell_anchor_price: string | null;
  last_session_date: string | null; // "YYYY-MM-DD"
  updated_at: Date;
};

export function isTradeComplete(row: ExecuteRow): boolean {
  return row.sell_price !== null && row.buy_price !== null;
}

export function hasActiveHoldings(rows: ExecuteRow[]): boolean {
  return rows.some((r) => !isTradeComplete(r));
}

export function triggersFromReference(ref: Decimal, upPct: Decimal, downPct: Decimal): [Decimal, Decimal] {
  const buyT = ref.times(new Decimal(1).minus(downPct.div(100))).toDecimalPlaces(2);
  const sellT = ref.times(new Decimal(1).plus(upPct.div(100))).toDecimalPlaces(2);
  return [buyT, sellT];
}

function rowLastEvent(row: ExecuteRow): [string, Decimal] | null {
  if (isTradeComplete(row)) {
    if (row.sell_price === null) return null;
    return [utcInstantToNaiveIstString(row.updated_at), d(row.sell_price, 2)];
  }
  if (row.buy_price === null) return null;
  return [combineDateTime(row.trade_date, row.trade_time), d(row.buy_price, 2)];
}

/**
 * Reference for the next trigger band: price of whichever action — any row's buy or sell —
 * happened most recently in real (IST) time. Rows can complete out of order when several
 * positions are open at once, so the highest row id is not always the most recent real action.
 */
export function lastActionRefPrice(rows: ExecuteRow[]): Decimal | null {
  const events = rows.map(rowLastEvent).filter((e): e is [string, Decimal] => e !== null);
  if (events.length === 0) return null;
  events.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return events[events.length - 1][1];
}

export function referenceForActiveRow(row: ExecuteRow, allRows?: ExecuteRow[]): Decimal | null {
  if (isTradeComplete(row)) return null;
  if (allRows !== undefined) return lastActionRefPrice(allRows);
  return row.buy_price !== null ? d(row.buy_price, 2) : null;
}

export async function getOrCreateState(scriptId: number): Promise<ScriptTriggerState> {
  const existing = await sql<ScriptTriggerState[]>`
    select * from script_trigger_state where script_id = ${scriptId}
  `;
  if (existing.length > 0) return existing[0];
  const [created] = await sql<ScriptTriggerState[]>`
    insert into script_trigger_state (script_id) values (${scriptId})
    on conflict (script_id) do update set script_id = excluded.script_id
    returning *
  `;
  return created;
}

/**
 * CASE 2: new IST day and no active holdings -> clear post-sell anchor (fresh session).
 * CASE 1: holdings exist -> keep anchors; only advance session date.
 * Returns [state, istCalendarAdvanced] — the second is true only on the first processing of a
 * new IST calendar day for this script (used for one-time fresh-session Telegram).
 */
export async function refreshOvernightSession(
  scriptId: number,
  rows: ExecuteRow[],
): Promise<[ScriptTriggerState, boolean]> {
  let st = await getOrCreateState(scriptId);
  const today = indiaTodayStr();
  const istCalendarAdvanced = st.last_session_date !== today;
  if (istCalendarAdvanced) {
    const anchor = hasActiveHoldings(rows) ? st.post_sell_anchor_price : null;
    const [updated] = await sql<ScriptTriggerState[]>`
      update script_trigger_state set post_sell_anchor_price = ${anchor}, last_session_date = ${today}
      where script_id = ${scriptId}
      returning *
    `;
    st = updated;
  } else if (st.last_session_date === null) {
    const [updated] = await sql<ScriptTriggerState[]>`
      update script_trigger_state set last_session_date = ${today}
      where script_id = ${scriptId}
      returning *
    `;
    st = updated;
  }
  return [st, istCalendarAdvanced];
}

/** Anchor = sell price of the latest (highest id) completed row; clear if none. */
export async function rebuildPostSellAnchor(scriptId: number): Promise<void> {
  await getOrCreateState(scriptId);
  const rows = await fetchRowsForScript(scriptId, "desc");
  let anchor: string | null = null;
  for (const r of rows) {
    if (isTradeComplete(r) && r.sell_price !== null) {
      anchor = d(r.sell_price, 2).toFixed(2);
      break;
    }
  }
  await sql`update script_trigger_state set post_sell_anchor_price = ${anchor} where script_id = ${scriptId}`;
}

/**
 * Returns [displayBuyTrigger, displaySellTrigger, pairs]. When any execute rows exist, one band
 * from lastActionRefPrice (latest row: sell if complete else buy). When no rows, use
 * post_sell_anchor then market (fresh session / overnight rules unchanged).
 */
export function aggregateLiveTriggers(
  rows: ExecuteRow[],
  upPct: Decimal,
  downPct: Decimal,
  marketPrice: Decimal | null,
  postSellAnchor: Decimal | null,
): [Decimal | null, Decimal | null, [Decimal, Decimal][]] {
  const activePairs: [Decimal, Decimal][] = [];
  if (rows.length > 0) {
    const ref = lastActionRefPrice(rows);
    if (ref !== null && ref.gt(0)) {
      activePairs.push(triggersFromReference(ref, upPct, downPct));
    }
  }

  if (activePairs.length > 0) {
    const minBuy = activePairs.reduce((min, p) => (p[0].lt(min) ? p[0] : min), activePairs[0][0]);
    const maxSell = activePairs.reduce((max, p) => (p[1].gt(max) ? p[1] : max), activePairs[0][1]);
    return [minBuy, maxSell, activePairs];
  }

  let ref: Decimal | null = null;
  if (postSellAnchor !== null && postSellAnchor.gt(0)) {
    ref = postSellAnchor;
  } else if (marketPrice !== null && marketPrice.gt(0)) {
    ref = marketPrice;
  }
  if (ref === null) return [null, null, []];
  const [bt, st] = triggersFromReference(ref, upPct, downPct);
  return [bt, st, [[bt, st]]];
}

export function monitoringMode(current: Decimal | null, buyT: Decimal | null, sellT: Decimal | null): string {
  if (current === null || buyT === null || sellT === null) return "INACTIVE";
  if (current.lte(buyT)) return "WAIT_BUY";
  if (current.gte(sellT)) return "WAIT_SELL";
  return "HOLDING";
}

/** How many active row trigger pairs are hit by current price (OR logic per side). */
export function countTriggerHits(current: Decimal | null, pairs: [Decimal, Decimal][]): [number, number] {
  if (current === null || pairs.length === 0) return [0, 0];
  let buys = 0;
  let sells = 0;
  for (const [bt, st] of pairs) {
    if (current.lte(bt)) buys++;
    if (current.gte(st)) sells++;
  }
  return [buys, sells];
}

export type PreparedTriggers = {
  rows: ExecuteRow[];
  state: ScriptTriggerState;
  current: Decimal | null;
  buyTrigger: Decimal | null;
  sellTrigger: Decimal | null;
  pairs: [Decimal, Decimal][];
};

/** Load rows, apply overnight session rules, compute live trigger pairs for this script. */
export async function prepareScriptTriggers(script: Script): Promise<PreparedTriggers> {
  const rows = await fetchRowsForScript(script.id, "asc");
  const [, istCalendarAdvanced] = await refreshOvernightSession(script.id, rows);
  const state = await getOrCreateState(script.id);
  const anchor = state.post_sell_anchor_price !== null ? d(state.post_sell_anchor_price, 2) : null;

  const priceF = await getQuoteCached(script.name);
  const current = priceF !== null ? d(priceF, 2) : null;
  const upPct = d(script.up_percent, 2);
  const downPct = d(script.down_percent, 2);

  const [buyTrigger, sellTrigger, pairs] = aggregateLiveTriggers(rows, upPct, downPct, current, anchor);

  const { emitFreshSessionIfApplicable } = await import("./telegramAlerts.ts");
  await emitFreshSessionIfApplicable(script, istCalendarAdvanced, rows, current, buyTrigger, sellTrigger, pairs);

  return { rows, state, current, buyTrigger, sellTrigger, pairs };
}
