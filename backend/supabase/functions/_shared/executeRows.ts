import { sql } from "./db.ts";

export type ExecuteRow = {
  id: number;
  script_id: number;
  trade_date: string; // "YYYY-MM-DD"
  trade_time: string; // "HH:MM:SS"
  buy_price: string;
  buy_qty: string;
  sell_price: string | null;
  sell_qty: string | null;
  up_value: string;
  down_value: string;
  qty_left: string;
  created_at: Date;
  updated_at: Date;
};

function normalizeRow(raw: Record<string, unknown>): ExecuteRow {
  const tradeDate = raw.trade_date instanceof Date ? raw.trade_date.toISOString().slice(0, 10) : String(raw.trade_date);
  const rawTime = String(raw.trade_time);
  const tradeTime = rawTime.length > 8 ? rawTime.slice(0, 8) : rawTime;
  return {
    id: raw.id as number,
    script_id: raw.script_id as number,
    trade_date: tradeDate,
    trade_time: tradeTime,
    buy_price: raw.buy_price as string,
    buy_qty: raw.buy_qty as string,
    sell_price: raw.sell_price as string | null,
    sell_qty: raw.sell_qty as string | null,
    up_value: raw.up_value as string,
    down_value: raw.down_value as string,
    qty_left: raw.qty_left as string,
    created_at: raw.created_at instanceof Date ? raw.created_at : new Date(raw.created_at as string),
    updated_at: raw.updated_at instanceof Date ? raw.updated_at : new Date(raw.updated_at as string),
  };
}

export async function fetchRowsForScript(scriptId: number, order: "asc" | "desc" = "asc"): Promise<ExecuteRow[]> {
  const raw =
    order === "asc"
      ? await sql`select * from execute_rows where script_id = ${scriptId} order by id asc`
      : await sql`select * from execute_rows where script_id = ${scriptId} order by id desc`;
  return raw.map(normalizeRow);
}

export async function fetchRowById(rowId: number): Promise<ExecuteRow | null> {
  const raw = await sql`select * from execute_rows where id = ${rowId}`;
  return raw.length > 0 ? normalizeRow(raw[0]) : null;
}

export async function insertRow(values: {
  script_id: number;
  trade_date: string;
  trade_time: string;
  buy_price: string;
  buy_qty: string;
  sell_price: string | null;
  sell_qty: string | null;
  up_value: string;
  down_value: string;
  qty_left: string;
}): Promise<ExecuteRow> {
  const raw = await sql`
    insert into execute_rows
      (script_id, trade_date, trade_time, buy_price, buy_qty, sell_price, sell_qty, up_value, down_value, qty_left)
    values
      (${values.script_id}, ${values.trade_date}, ${values.trade_time}, ${values.buy_price}, ${values.buy_qty},
       ${values.sell_price}, ${values.sell_qty}, ${values.up_value}, ${values.down_value}, ${values.qty_left})
    returning *
  `;
  return normalizeRow(raw[0]);
}

export async function updateRowById(
  rowId: number,
  values: {
    trade_date: string;
    trade_time: string;
    buy_price: string;
    buy_qty: string;
    sell_price: string | null;
    sell_qty: string | null;
    up_value: string;
    down_value: string;
    qty_left: string;
  },
): Promise<ExecuteRow | null> {
  const raw = await sql`
    update execute_rows set
      trade_date = ${values.trade_date},
      trade_time = ${values.trade_time},
      buy_price = ${values.buy_price},
      buy_qty = ${values.buy_qty},
      sell_price = ${values.sell_price},
      sell_qty = ${values.sell_qty},
      up_value = ${values.up_value},
      down_value = ${values.down_value},
      qty_left = ${values.qty_left},
      updated_at = (now() at time zone 'utc')
    where id = ${rowId}
    returning *
  `;
  return raw.length > 0 ? normalizeRow(raw[0]) : null;
}
