import { Decimal, d, decOut, floorInt } from "./decimal.ts";
import { fetchRowById, fetchRowsForScript, insertRow, updateRowById, type ExecuteRow } from "./executeRows.ts";
export type { ExecuteRow } from "./executeRows.ts";
import { getScript, type Script } from "./scriptService.ts";
import * as tl from "./triggerLifecycle.ts";
import { clearAllEdgeStateForScript, getTriggerVisualStates, notifyRowAfterSave } from "./telegramAlerts.ts";
import { utcInstantToNaiveIstString } from "./wallclock.ts";

export class NoSlotAvailableError extends Error {}
export class ZeroQtyError extends Error {}

export type ExecuteRowInput = {
  trade_date: string;
  trade_time: string;
  buy_price: number;
  sell_price: number | null;
};

function slotAmount(script: Script): Decimal {
  const denom = script.invest_slots;
  if (denom <= 0) return new Decimal(0);
  return d(script.total_invest_amount, 2).div(denom);
}

function calcQty(slotAmt: Decimal, buyPrice: Decimal): Decimal {
  if (buyPrice.lte(0)) return new Decimal(0);
  return floorInt(slotAmt.div(buyPrice));
}

export async function serializeRow(
  script: Script,
  row: ExecuteRow,
  allRows: ExecuteRow[],
  currentPrice: Decimal | null,
): Promise<Record<string, unknown>> {
  const upPct = d(script.up_percent, 2);
  const downPct = d(script.down_percent, 2);
  const complete = tl.isTradeComplete(row);
  let lbt: Decimal | null = null;
  let lst: Decimal | null = null;
  if (!complete) {
    const ref = tl.referenceForActiveRow(row, allRows);
    if (ref !== null && ref.gt(0)) {
      [lbt, lst] = tl.triggersFromReference(ref, upPct, downPct);
    }
  }
  const vis = await getTriggerVisualStates(script.id, currentPrice, lbt, lst);
  return {
      id: row.id,
      script_id: row.script_id,
      trade_date: row.trade_date,
      trade_time: row.trade_time,
      buy_price: decOut(row.buy_price),
      buy_qty: decOut(row.buy_qty, 6),
      sell_price: decOut(row.sell_price),
      sell_qty: decOut(row.sell_qty, 6),
      up_value: decOut(row.up_value),
      down_value: decOut(row.down_value),
      qty_left: decOut(row.qty_left, 6),
      created_at: row.created_at.toISOString(),
      updated_at: utcInstantToNaiveIstString(row.updated_at),
      is_trade_complete: complete,
      live_buy_trigger: decOut(lbt),
      live_sell_trigger: decOut(lst),
      // Deliberately crossed, matching the original: up_visual_state <- sell_state, down_visual_state <- buy_state.
    up_visual_state: vis.sell_state,
    down_visual_state: vis.buy_state,
  };
}

export async function getExecuteDetails(scriptId: number): Promise<Record<string, unknown> | null> {
  const script = await getScript(scriptId);
  if (!script) return null;

  const { rows: exRows, current, buyTrigger, sellTrigger } = await tl.prepareScriptTriggers(script);
  const vis = await getTriggerVisualStates(script.id, current, buyTrigger, sellTrigger);

  const upPercent = d(script.up_percent, 2);
  const downPercent = d(script.down_percent, 2);

  // Only currently-open positions count as "invested" — a completed (sold) row's qty_left is 0.
  let investedAmount = new Decimal(0);
  let totalQuantity = new Decimal(0);
  for (const r of exRows) {
    investedAmount = investedAmount.plus(d(r.buy_price).times(d(r.qty_left, 6)));
    totalQuantity = totalQuantity.plus(d(r.qty_left, 6));
  }
  investedAmount = investedAmount.toDecimalPlaces(2);
  totalQuantity = totalQuantity.toDecimalPlaces(2);

  const currentValue =
    current !== null ? totalQuantity.times(current).toDecimalPlaces(2) : new Decimal(0).toDecimalPlaces(2);
  const currentHoldings = currentValue;
  const positions = exRows.filter((r) => d(r.qty_left, 6).gt(0)).length;

  type Alert = { side: string; price: Decimal; timestamp: string };
  const alerts: Alert[] = [];
  for (const r of exRows) {
    alerts.push({ side: "BUY", price: d(r.buy_price, 2), timestamp: `${r.trade_date}T${r.trade_time}` });
    if (r.sell_price !== null) {
      alerts.push({ side: "SELL", price: d(r.sell_price, 2), timestamp: utcInstantToNaiveIstString(r.updated_at) });
    }
  }
  alerts.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));

  return {
    script_id: script.id,
    script_name: script.name,
    current_market_price: decOut(current),
    buy_trigger_value: decOut(buyTrigger),
    sell_trigger_value: decOut(sellTrigger),
    invested_amount: decOut(investedAmount),
    current_value: decOut(currentValue),
    current_holdings: decOut(currentHoldings),
    current_holding_positions: positions,
    total_quantity: decOut(totalQuantity),
    up_percent: decOut(upPercent),
    down_percent: decOut(downPercent),
    total_invest_amount: decOut(script.total_invest_amount),
    invest_slots: script.invest_slots,
    max_buy: script.max_buy,
    max_rows: script.invest_slots * script.max_buy,
    recent_alerts: alerts.slice(0, 5).map((a) => ({ side: a.side, price: decOut(a.price), timestamp: a.timestamp })),
    buy_visual_state: vis.buy_state,
    sell_visual_state: vis.sell_state,
  };
}

export async function getExecuteRows(scriptId: number): Promise<{ rows: Record<string, unknown>[] } | null> {
  const script = await getScript(scriptId);
  if (!script) return null;
  const { current } = await tl.prepareScriptTriggers(script);
  const rows = await fetchRowsForScript(scriptId, "asc");
  return { rows: await Promise.all(rows.map((r) => serializeRow(script, r, rows, current))) };
}

export async function addExecuteRow(
  scriptId: number,
  payload: ExecuteRowInput,
  notify = true,
): Promise<ExecuteRow | null> {
  const script = await getScript(scriptId);
  if (!script) return null;

  // Cap concurrent open positions at invest_slots — each slot commits total_invest_amount /
  // invest_slots, so letting more than invest_slots stay open at once overcommits capital.
  const existing = await fetchRowsForScript(scriptId, "asc");
  const openPositions = existing.filter((r) => d(r.qty_left, 6).gt(0)).length;
  if (openPositions >= script.invest_slots) {
    throw new NoSlotAvailableError();
  }

  const buyPrice = d(payload.buy_price, 2);
  const slotAmt = slotAmount(script);
  const buyQty = calcQty(slotAmt, buyPrice);
  if (buyQty.lte(0)) throw new ZeroQtyError();
  const sellPrice = payload.sell_price !== null ? d(payload.sell_price, 2) : null;
  const sellQty = sellPrice !== null ? buyQty : null;

  const upValue = buyPrice.times(new Decimal(1).plus(d(script.up_percent, 2).div(100))).toDecimalPlaces(2);
  const downValue = buyPrice.times(new Decimal(1).minus(d(script.down_percent, 2).div(100))).toDecimalPlaces(2);
  const qtyLeft = sellPrice !== null ? new Decimal(0).toDecimalPlaces(2) : buyQty;

  const row = await insertRow({
    script_id: scriptId,
    trade_date: payload.trade_date,
    trade_time: payload.trade_time,
    buy_price: buyPrice.toFixed(2),
    buy_qty: buyQty.toFixed(6),
    sell_price: sellPrice !== null ? sellPrice.toFixed(2) : null,
    sell_qty: sellQty !== null ? sellQty.toFixed(6) : null,
    up_value: upValue.toFixed(2),
    down_value: downValue.toFixed(2),
    qty_left: qtyLeft.toFixed(6),
  });

  await tl.rebuildPostSellAnchor(scriptId);
  await clearAllEdgeStateForScript(scriptId);
  if (notify && !tl.isTradeComplete(row)) {
    await notifyRowAfterSave(script, row);
  }
  return row;
}

export async function updateExecuteRow(
  rowId: number,
  payload: ExecuteRowInput,
  notify = true,
): Promise<ExecuteRow | null> {
  const existingRow = await fetchRowById(rowId);
  if (!existingRow) return null;
  const script = await getScript(existingRow.script_id);
  if (!script) return null;

  const buyPrice = d(payload.buy_price, 2);
  const slotAmt = slotAmount(script);
  const buyQty = calcQty(slotAmt, buyPrice);
  const sellPrice = payload.sell_price !== null ? d(payload.sell_price, 2) : null;
  const sellQty = sellPrice !== null ? buyQty : null;

  const upValue = buyPrice.times(new Decimal(1).plus(d(script.up_percent, 2).div(100))).toDecimalPlaces(2);
  const downValue = buyPrice.times(new Decimal(1).minus(d(script.down_percent, 2).div(100))).toDecimalPlaces(2);
  const qtyLeft = sellPrice !== null ? new Decimal(0).toDecimalPlaces(2) : buyQty;

  const row = await updateRowById(rowId, {
    trade_date: payload.trade_date,
    trade_time: payload.trade_time,
    buy_price: buyPrice.toFixed(2),
    buy_qty: buyQty.toFixed(6),
    sell_price: sellPrice !== null ? sellPrice.toFixed(2) : null,
    sell_qty: sellQty !== null ? sellQty.toFixed(6) : null,
    up_value: upValue.toFixed(2),
    down_value: downValue.toFixed(2),
    qty_left: qtyLeft.toFixed(6),
  });
  if (!row) return null;

  await tl.rebuildPostSellAnchor(row.script_id);
  await clearAllEdgeStateForScript(row.script_id);
  if (notify && !tl.isTradeComplete(row)) {
    await notifyRowAfterSave(script, row);
  }
  return row;
}
