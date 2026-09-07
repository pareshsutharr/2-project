import { sql } from "./db.ts";
import { Decimal, d } from "./decimal.ts";
import { fetchRowsForScript, type ExecuteRow } from "./executeRows.ts";
import type { Script } from "./scriptService.ts";

function telegramConfigured(): boolean {
  const token = (Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "").trim();
  const chat = (Deno.env.get("TELEGRAM_CHAT_ID") ?? "").trim();
  return Boolean(token && chat);
}

/** POST sendMessage. Returns true on success. Never throws. */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = (Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "").trim();
  const chatId = (Deno.env.get("TELEGRAM_CHAT_ID") ?? "").trim();
  if (!token || !chatId) return false;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000) }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      console.warn("Telegram sendMessage failed:", res.status, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.warn("Telegram request error:", e);
    return false;
  }
}

/** Reset only edge-state latches for a script (re-arm detection). */
export async function clearAllEdgeStateForScript(scriptId: number): Promise<void> {
  await sql`delete from trigger_edge_state where script_id = ${scriptId}`;
}

export type VisualStates = { buy_state: string; sell_state: string };

export async function getTriggerVisualStates(
  scriptId: number,
  current: Decimal | null,
  buyT: Decimal | null,
  sellT: Decimal | null,
): Promise<VisualStates> {
  const [vm] = await sql<{ buy_hit_once: boolean; sell_hit_once: boolean }[]>`
    insert into trigger_visual_memory (script_id, buy_hit_once, sell_hit_once)
    values (${scriptId}, false, false)
    on conflict (script_id) do update set script_id = excluded.script_id
    returning buy_hit_once, sell_hit_once
  `;

  const buyInside = current !== null && buyT !== null && current.lte(buyT);
  const sellInside = current !== null && sellT !== null && current.gte(sellT);

  const buyState = buyInside ? "ACTIVE" : vm.buy_hit_once ? "TRIGGERED" : "NORMAL";
  const sellState = sellInside ? "ACTIVE" : vm.sell_hit_once ? "TRIGGERED" : "NORMAL";
  return { buy_state: buyState, sell_state: sellState };
}

export async function emitFreshSessionIfApplicable(
  script: Script,
  istCalendarAdvanced: boolean,
  rows: ExecuteRow[],
  current: Decimal | null,
  buyT: Decimal | null,
  sellT: Decimal | null,
  pairs: [Decimal, Decimal][],
): Promise<void> {
  if (!telegramConfigured() || !istCalendarAdvanced) return;

  const { hasActiveHoldings } = await import("./triggerLifecycle.ts");
  if (hasActiveHoldings(rows)) return;
  if (current === null || buyT === null || sellT === null || pairs.length === 0) return;

  await sendTelegramMessage(
    `🌅 Fresh session (IST)\n` +
      `No open holdings from the prior day.\n` +
      `Script: ${script.name}\n` +
      `LTP (reference): ${current}\n` +
      `Buy trigger: ${buyT}\n` +
      `Sell trigger: ${sellT}`,
  );
}

/** One edge step for a logical row (real execute row id, or 0 = aggregate band). */
async function processRowEdge(
  script: Script,
  rowId: number,
  current: Decimal,
  buyT: Decimal,
  sellT: Decimal,
): Promise<void> {
  const sid = script.id;
  const buyZ = current.lte(buyT);
  const sellZ = current.gte(sellT);
  let sendBuy = false;
  let sendSell = false;

  await sql.begin(async (tx) => {
    const [prev] = await tx<{ buy_zone: boolean; sell_zone: boolean }[]>`
      insert into trigger_edge_state (script_id, row_id, buy_zone, sell_zone)
      values (${sid}, ${rowId}, false, false)
      on conflict (script_id, row_id) do update set script_id = excluded.script_id
      returning buy_zone, sell_zone
    `;
    // Emit at most one side per evaluation to avoid dual messages.
    if (buyZ && !prev.buy_zone) {
      sendBuy = true;
      await tx`
        insert into trigger_visual_memory (script_id, buy_hit_once, sell_hit_once)
        values (${sid}, true, false)
        on conflict (script_id) do update set buy_hit_once = true
      `;
    } else if (sellZ && !prev.sell_zone) {
      sendSell = true;
      await tx`
        insert into trigger_visual_memory (script_id, buy_hit_once, sell_hit_once)
        values (${sid}, false, true)
        on conflict (script_id) do update set sell_hit_once = true
      `;
    }
    await tx`
      update trigger_edge_state set buy_zone = ${buyZ}, sell_zone = ${sellZ}
      where script_id = ${sid} and row_id = ${rowId}
    `;
  });

  const label = rowId ? `Row #${rowId}` : "Last-action band";
  if (sendBuy) {
    await sendTelegramMessage(
      `🔔 ${label} — BUY side\n` +
        `Script: ${script.name}\n` +
        `LTP: ${current}\n` +
        `Buy trigger (≤): ${buyT}  |  Sell trigger (≥): ${sellT}`,
    );
  }
  if (sendSell) {
    await sendTelegramMessage(
      `🔔 ${label} — SELL side\n` +
        `Script: ${script.name}\n` +
        `LTP: ${current}\n` +
        `Buy trigger (≤): ${buyT}  |  Sell trigger (≥): ${sellT}`,
    );
  }
}

/**
 * After creating/updating a row: if LTP already hits the current last-action band, send once
 * and sync edge state so polling does not duplicate.
 */
export async function notifyRowAfterSave(script: Script, row: ExecuteRow): Promise<void> {
  if (!telegramConfigured()) return;

  const tl = await import("./triggerLifecycle.ts");
  const { fetchStockQuoteNse } = await import("./marketService.ts");

  const allRows = await fetchRowsForScript(script.id, "asc");
  const ref = tl.lastActionRefPrice(allRows);
  if (ref === null || ref.lte(0)) return;
  const priceF = await fetchStockQuoteNse(script.name);
  if (priceF === null) return;
  const current = d(priceF, 2);
  const upPct = d(script.up_percent, 2);
  const downPct = d(script.down_percent, 2);
  const [bt, st] = tl.triggersFromReference(ref, upPct, downPct);
  await processRowEdge(script, 0, current, bt, st);
}
