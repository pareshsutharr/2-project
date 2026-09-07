import { Play, TrendingUp, TrendingDown } from "lucide-react";
import Badge from "./Badge.jsx";
import { usePriceDirection } from "../utils/usePriceDirection.js";

function fmt(n, opts = {}) {
  if (n == null) return "—";
  const num = Number(n);
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, ...opts }).format(num);
}

function modeTone(mode) {
  if (mode === "HOLDING") return "success";
  if (mode === "WAIT_SELL") return "warning";
  if (mode === "WAIT_BUY") return "neutral";
  return "danger";
}

function triggerCellClass(side, state) {
  if (state === "ACTIVE") {
    return side === "buy"
      ? "text-emerald-700 bg-emerald-50/80 ring-1 ring-emerald-200 animate-pulse rounded-lg px-2 py-1"
      : "text-rose-700 bg-rose-50/80 ring-1 ring-rose-200 animate-pulse rounded-lg px-2 py-1";
  }
  if (state === "TRIGGERED") {
    return side === "buy"
      ? "text-emerald-700 bg-emerald-50/60 ring-1 ring-emerald-200 rounded-lg px-2 py-1"
      : "text-rose-700 bg-rose-50/60 ring-1 ring-rose-200 rounded-lg px-2 py-1";
  }
  return "text-slate-700";
}

function MonitoringRow({ row: r, onExecute }) {
  const { direction, flash } = usePriceDirection(r.current);
  return (
    <tr className="border-b border-slate-100 transition hover:bg-slate-50/70">
      <td className="sticky left-0 z-10 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-wide text-slate-900">{r.script}</span>
          <span className="text-xs text-slate-400">ID {r.id}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm font-semibold tabular-nums text-slate-800">
        <span
          className={[
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors duration-700",
            flash ? (direction === "up" ? "bg-emerald-100" : "bg-rose-100") : "bg-transparent",
          ].join(" ")}
        >
          {direction === "up" ? (
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
          ) : direction === "down" ? (
            <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
          ) : null}
          {fmt(r.current)}
        </span>
      </td>
      <td className="px-4 py-3 text-sm tabular-nums">
        <span className={triggerCellClass("buy", r.buy_visual_state)}>{fmt(r.buy_price)}</span>
      </td>
      <td className="px-4 py-3 text-sm tabular-nums">
        <span className={triggerCellClass("sell", r.sell_visual_state)}>{fmt(r.sell_price)}</span>
      </td>
      <td className="px-4 py-3 text-sm tabular-nums text-slate-700">{fmt(r.qty, { maximumFractionDigits: 0 })}</td>
      <td className="px-4 py-3 text-sm tabular-nums">{r.pnl == null ? <span className="text-slate-400">—</span> : fmt(r.pnl)}</td>
      <td className="px-4 py-3">
        <Badge tone={modeTone(r.mode)}>{r.mode}</Badge>
      </td>
      <td className="px-4 py-3 text-sm tabular-nums text-slate-700">{fmt(r.buy_slots_left, { maximumFractionDigits: 0 })}</td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => onExecute?.(r)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Play className="h-3.5 w-3.5" />
          Execute
        </button>
      </td>
    </tr>
  );
}

export default function MonitoringTable({ rows, onExecute }) {
  return (
    <div className="animate-fade-in rounded-2xl bg-white shadow-md ring-1 ring-slate-100">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Monitoring</h2>
          <p className="mt-0.5 text-sm text-slate-500">Active scripts only. Prices are fetched by the backend.</p>
        </div>
        <div className="text-xs font-semibold text-slate-400">
          Rows: <span className="text-slate-700">{rows.length}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="sticky left-0 z-10 bg-white/95 px-4 py-3 backdrop-blur">Script</th>
              <th className="px-4 py-3">Current</th>
              <th className="px-4 py-3">Buy Price</th>
              <th className="px-4 py-3">Sell Price</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">P&amp;L</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Buy Slot Left</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-500">
                  No active scripts found. Enable scripts in Config to start monitoring.
                </td>
              </tr>
            ) : (
              rows.map((r) => <MonitoringRow key={r.id} row={r} onExecute={onExecute} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

