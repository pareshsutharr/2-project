import { sql } from "./db.ts";
import { Decimal, d, decOut, floorInt } from "./decimal.ts";
import { getTriggerVisualStates } from "./telegramAlerts.ts";
import * as tl from "./triggerLifecycle.ts";
import type { Script } from "./scriptService.ts";

async function activeScripts(): Promise<Script[]> {
  return await sql<Script[]>`select * from scripts where active = true order by created_at desc`;
}

function calcQty(current: Decimal | null, totalInvestAmount: Decimal, investSlots: number): number {
  if (current === null || current.lte(0) || investSlots <= 0) return 0;
  const slotAmount = investSlots ? totalInvestAmount.div(investSlots) : new Decimal(0);
  if (slotAmount.lte(0)) return 0;
  return floorInt(slotAmount.div(current)).toNumber();
}

/** Booked profit/loss from every completed trade ever, across all scripts. */
async function realizedPnl(): Promise<[Decimal, Decimal]> {
  const rows = await sql<{ buy_price: string; sell_price: string; sell_qty: string }[]>`
    select buy_price, sell_price, sell_qty from execute_rows where sell_price is not null
  `;
  let profit = new Decimal(0);
  let loss = new Decimal(0);
  for (const r of rows) {
    const pnl = d(r.sell_price).minus(d(r.buy_price)).times(r.sell_qty ? d(r.sell_qty, 6) : new Decimal(0));
    if (pnl.gt(0)) profit = profit.plus(pnl);
    else if (pnl.lt(0)) loss = loss.plus(pnl.neg());
  }
  return [profit.toDecimalPlaces(2), loss.toDecimalPlaces(2)];
}

export async function getSummary(): Promise<Record<string, unknown>> {
  const scripts = await activeScripts();

  let buyAlerts = 0;
  let sellAlerts = 0;
  let holdingsCount = 0;
  let marketValue = new Decimal(0);
  let holdingsCost = new Decimal(0);
  let totalOpenQty = new Decimal(0);

  for (const s of scripts) {
    const { rows: exRows, current, pairs } = await tl.prepareScriptTriggers(s);
    const [bh, sh] = tl.countTriggerHits(current, pairs);
    buyAlerts += bh;
    sellAlerts += sh;

    holdingsCount += exRows.filter((r) => !tl.isTradeComplete(r)).length;

    let totQty = new Decimal(0);
    let rowCost = new Decimal(0);
    for (const r of exRows) {
      const qtyLeft = d(r.qty_left, 6);
      totQty = totQty.plus(qtyLeft);
      if (qtyLeft.gt(0)) rowCost = rowCost.plus(d(r.buy_price).times(qtyLeft));
    }
    totalOpenQty = totalOpenQty.plus(totQty);
    holdingsCost = holdingsCost.plus(rowCost.toDecimalPlaces(2));

    if (current !== null && current.gt(0) && totQty.gt(0)) {
      marketValue = marketValue.plus(totQty.times(current).toDecimalPlaces(2));
    }
  }

  const investedAmount = holdingsCost;

  let currentValue: Decimal;
  let unrealized: Decimal;
  if (totalOpenQty.lte(0)) {
    currentValue = new Decimal(0).toDecimalPlaces(2);
    unrealized = new Decimal(0).toDecimalPlaces(2);
  } else {
    currentValue = marketValue.gt(0) ? marketValue : holdingsCost;
    unrealized = currentValue.minus(holdingsCost).toDecimalPlaces(2);
  }

  const [realizedProfit, realizedLoss] = await realizedPnl();
  const profit = Decimal.max(unrealized, 0).plus(realizedProfit).toDecimalPlaces(2);
  const loss = Decimal.max(unrealized.neg(), 0).plus(realizedLoss).toDecimalPlaces(2);

  return {
    invested_amount: decOut(investedAmount),
    current_value: decOut(currentValue),
    profit: decOut(profit),
    loss: decOut(loss),
    holdings_count: holdingsCount,
    buy_alerts: buyAlerts,
    sell_alerts: sellAlerts,
  };
}

export async function getMonitoring(): Promise<{ rows: Record<string, unknown>[] }> {
  const scripts = await activeScripts();
  const rows: Record<string, unknown>[] = [];

  for (const s of scripts) {
    const { rows: exRows, current, buyTrigger, sellTrigger } = await tl.prepareScriptTriggers(s);
    const mode = tl.monitoringMode(current, buyTrigger, sellTrigger);
    const visual = await getTriggerVisualStates(s.id, current, buyTrigger, sellTrigger);

    let qty: number;
    if (tl.hasActiveHoldings(exRows)) {
      let tq = new Decimal(0);
      for (const r of exRows) {
        if (!tl.isTradeComplete(r)) tq = tq.plus(d(r.qty_left, 6));
      }
      qty = floorInt(tq).toNumber();
    } else {
      qty = calcQty(current, d(s.total_invest_amount, 2), s.invest_slots);
    }

    rows.push({
      id: s.id,
      script: s.name,
      current: decOut(current),
      buy_price: decOut(buyTrigger),
      sell_price: decOut(sellTrigger),
      qty,
      pnl: null,
      mode,
      buy_slots_left: s.invest_slots,
      buy_visual_state: visual.buy_state,
      sell_visual_state: visual.sell_state,
    });
  }

  return { rows };
}
