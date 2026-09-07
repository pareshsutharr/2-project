import { sql } from "./db.ts";
import { d } from "./decimal.ts";
import { symbolExistsOnNse } from "./marketService.ts";

export type Script = {
  id: number;
  name: string;
  up_percent: string;
  down_percent: string;
  total_invest_amount: string;
  invest_slots: number;
  max_buy: number;
  active: boolean;
  created_at: Date;
};

export type ScriptInput = {
  name: string;
  up_percent: number;
  down_percent: number;
  total_invest_amount: number;
  invest_slots: number;
  max_buy: number;
  active: boolean;
};

export class ScriptNotFoundOnNseError extends Error {}

export function normalizeScriptName(name: string): string {
  return name.trim().toUpperCase();
}

export function listScripts(): Promise<Script[]> {
  return sql<Script[]>`select * from scripts order by created_at desc`;
}

export async function getScript(scriptId: number): Promise<Script | null> {
  const rows = await sql<Script[]>`select * from scripts where id = ${scriptId}`;
  return rows[0] ?? null;
}

export async function createScript(payload: ScriptInput): Promise<Script> {
  const name = normalizeScriptName(payload.name);
  if (!(await symbolExistsOnNse(name))) {
    throw new ScriptNotFoundOnNseError();
  }
  const [row] = await sql<Script[]>`
    insert into scripts (name, up_percent, down_percent, total_invest_amount, invest_slots, max_buy, active)
    values (
      ${name},
      ${d(payload.up_percent).toString()},
      ${d(payload.down_percent).toString()},
      ${d(payload.total_invest_amount).toString()},
      ${payload.invest_slots},
      ${payload.max_buy},
      ${payload.active}
    )
    returning *
  `;
  return row;
}

export async function updateScript(scriptId: number, payload: ScriptInput): Promise<Script | null> {
  const existing = await getScript(scriptId);
  if (!existing) return null;
  const name = normalizeScriptName(payload.name);
  if (name !== existing.name && !(await symbolExistsOnNse(name))) {
    throw new ScriptNotFoundOnNseError();
  }
  const [row] = await sql<Script[]>`
    update scripts set
      name = ${name},
      up_percent = ${d(payload.up_percent).toString()},
      down_percent = ${d(payload.down_percent).toString()},
      total_invest_amount = ${d(payload.total_invest_amount).toString()},
      invest_slots = ${payload.invest_slots},
      max_buy = ${payload.max_buy},
      active = ${payload.active}
    where id = ${scriptId}
    returning *
  `;
  return row;
}

export async function deleteScript(scriptId: number): Promise<boolean> {
  const rows = await sql`delete from scripts where id = ${scriptId} returning id`;
  return rows.length > 0;
}
