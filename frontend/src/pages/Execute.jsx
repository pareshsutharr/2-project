import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Banknote, History, TrendingUp, TrendingDown } from "lucide-react";
import { fetchExecuteDetails, fetchExecuteRows } from "../services/api.js";
import ScriptNewsCard from "../components/ScriptNewsCard.jsx";
import { usePriceDirection } from "../utils/usePriceDirection.js";

function fmtNum(v, opts = {}) {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, ...opts }).format(n);
}

function fmtDateTime(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function timeForInput(t) {
  if (t == null || t === "") return "";
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function triggerToneClasses(side, state) {
  if (state === "ACTIVE") {
    return side === "buy"
      ? "border-emerald-300 bg-emerald-50 animate-pulse"
      : "border-rose-300 bg-rose-50 animate-pulse";
  }
  if (state === "TRIGGERED") {
    return side === "buy" ? "border-emerald-300 bg-emerald-50/70" : "border-rose-300 bg-rose-50/70";
  }
  return side === "buy" ? "border-emerald-200/70 bg-emerald-50/60" : "border-rose-200/70 bg-rose-50/60";
}

function triggerBadgeClasses(side, state) {
  if (state === "ACTIVE") {
    return side === "buy"
      ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 animate-pulse"
      : "rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 animate-pulse";
  }
  if (state === "TRIGGERED") {
    return side === "buy"
      ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
      : "rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700";
  }
  return side === "buy"
    ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
    : "rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700";
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

export default function Execute() {
  const { scriptId } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!scriptId) return;
    setError("");
    try {
      const [d, r] = await Promise.all([fetchExecuteDetails(scriptId), fetchExecuteRows(scriptId)]);
      setDetails(d);
      setRows(r.rows || []);
    } catch {
      setError("Could not load execute data.");
    } finally {
      setLoading(false);
    }
  }, [scriptId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      load();
    }, 5000);
    return () => clearInterval(id);
  }, [load]);

  const maxRows = Number(details?.max_rows ?? 0);

  const pnlTone = useMemo(() => {
    const invested = Number(details?.invested_amount ?? 0);
    const current = Number(details?.current_value ?? 0);
    if (current > invested) return "success";
    if (current < invested) return "danger";
    return "neutral";
  }, [details?.current_value, details?.invested_amount]);

  const { direction: priceDirection, flash: priceFlash } = usePriceDirection(details?.current_market_price);
  const currentPrice = Number(details?.current_market_price ?? 0);
  const buyTrigger = Number(details?.buy_trigger_value ?? 0);
  const buyTriggered = currentPrice > 0 && buyTrigger > 0 && currentPrice <= buyTrigger;
  const buyVisual = details?.buy_visual_state ?? "NORMAL";
  const sellVisual = details?.sell_visual_state ?? "NORMAL";

  // A completed (sold) row moves to trade history — only open positions show here.
  const openRows = rows.filter((r) => !r.is_trade_complete);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{details?.script_name || "Execute"}</h1>
          <p className="mt-1 text-sm text-slate-500">Automated script execution and holdings monitoring.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(`/history/${scriptId}`)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <History className="h-4 w-4" />
            {details?.script_name ? `${details.script_name} trade history` : "Trade history"}
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          {error}
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="rounded-2xl bg-white p-5 shadow-md ring-1 ring-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Current Price</p>
              <div
                className={[
                  "mt-1 flex items-baseline gap-2 rounded-xl px-2 py-1 -mx-2 transition-colors duration-700",
                  priceFlash ? (priceDirection === "up" ? "bg-emerald-50" : "bg-rose-50") : "bg-transparent",
                ].join(" ")}
              >
                <Banknote className="h-6 w-6 text-slate-700" />
                <h2 className="text-5xl font-semibold tracking-tight text-slate-900">
                  {fmtNum(details?.current_market_price, { maximumFractionDigits: 2 })}
                </h2>
                {priceDirection === "up" ? (
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                ) : priceDirection === "down" ? (
                  <TrendingDown className="h-6 w-6 text-rose-600" />
                ) : null}
              </div>
            </div>
            <div className="mt-1">
              <span
                className={[
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  buyTriggered ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600",
                ].join(" ")}
              >
                {buyTriggered ? "BUY TRIGGERED" : "LIVE"}
              </span>
            </div>
          </div>

          <p className="mt-3 text-sm text-slate-500">
            Buy @ {fmtNum(details?.buy_trigger_value, { maximumFractionDigits: 2 })} • Sell @{" "}
            {fmtNum(details?.sell_trigger_value, { maximumFractionDigits: 2 })}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className={`rounded-xl border p-3 ${triggerToneClasses("buy", buyVisual)}`}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Buy Trigger</p>
                <span className={triggerBadgeClasses("buy", buyVisual)}>
                  {buyVisual === "ACTIVE" ? "LIVE" : buyVisual === "TRIGGERED" ? "HIT" : "WAIT"}
                </span>
              </div>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {fmtNum(details?.buy_trigger_value, { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-slate-500">Rule: price ≤ buy trigger</p>
            </div>
            <div className={`rounded-xl border p-3 ${triggerToneClasses("sell", sellVisual)}`}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">Sell Trigger</p>
                <span className={triggerBadgeClasses("sell", sellVisual)}>
                  {sellVisual === "ACTIVE" ? "LIVE" : sellVisual === "TRIGGERED" ? "HIT" : "WAIT"}
                </span>
              </div>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {fmtNum(details?.sell_trigger_value, { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-slate-500">Rule: price ≥ sell trigger</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
              <p className="text-xs text-slate-500">Invested Amount</p>
              <p className="text-lg font-semibold tabular-nums text-slate-900">
                {fmtNum(details?.invested_amount, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
              <p className="text-xs text-slate-500">Current Value</p>
              <p
                className={[
                  "text-lg font-semibold tabular-nums",
                  pnlTone === "success" ? "text-emerald-700" : pnlTone === "danger" ? "text-rose-700" : "text-slate-900",
                ].join(" ")}
              >
                {fmtNum(details?.current_value, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
              <p className="text-xs text-slate-500">Current Holding Positions</p>
              <p className="text-lg font-semibold tabular-nums text-slate-900">
                {fmtNum(details?.current_holding_positions, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
              <p className="text-xs text-slate-500">Total Quantity</p>
              <p className="text-lg font-semibold tabular-nums text-slate-900">
                {fmtNum(details?.total_quantity, { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-md ring-1 ring-slate-100">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Recent Alerts</h2>
            <span className="text-xs font-semibold text-slate-400">Latest {(details?.recent_alerts || []).length}</span>
          </div>
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {(details?.recent_alerts || []).length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">No recent alerts yet.</p>
            ) : (
              details.recent_alerts.map((a, idx) => {
                const buy = a.side === "BUY";
                const dt = new Date(a.timestamp);
                return (
                  <div key={`${a.timestamp}-${idx}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                    <div className="flex items-center gap-2">
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          buy ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                        ].join(" ")}
                      >
                        {a.side}
                      </span>
                      <span className="text-xs text-slate-500">{fmtDateTime(dt)}</span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-slate-800">
                      ₹ {fmtNum(a.price, { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white shadow-md ring-1 ring-slate-100">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Holdings Management</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Max rows: {maxRows || 0} | Open positions: {openRows.length} • Trades are executed automatically. A
            position moves to trade history once it's sold.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left">
            <thead className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-3">Sr. No.</th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Time</th>
                <th className="px-3 py-3">Buy Price</th>
                <th className="px-3 py-3">Buy Qty</th>
                <th className="px-3 py-3">Live Buy Trig</th>
                <th className="px-3 py-3">Live Sell Trig</th>
                <th className="px-3 py-3">Up (%)</th>
                <th className="px-3 py-3">Down (%)</th>
                <th className="px-3 py-3">Qty Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center text-sm text-slate-500">
                    Loading rows...
                  </td>
                </tr>
              ) : openRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center text-sm text-slate-500">
                    No open positions. The automation will create one when the buy trigger is hit.
                  </td>
                </tr>
              ) : (
                openRows.map((r, i) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 text-sm text-slate-700">{i + 1}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700">{r.trade_date}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700">{timeForInput(r.trade_time)}</td>
                    <td className="px-3 py-2.5 text-sm tabular-nums text-slate-700">
                      {fmtNum(r.buy_price, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2.5 text-sm tabular-nums text-slate-700">
                      {fmtNum(r.buy_qty, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2.5 text-sm tabular-nums text-slate-600">
                      {fmtNum(r.live_buy_trigger, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2.5 text-sm tabular-nums text-slate-600">
                      {fmtNum(r.live_sell_trigger, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2.5 text-sm tabular-nums">
                      <span className={triggerCellClass("sell", r.up_visual_state ?? "NORMAL")}>
                        {fmtNum(r.up_value, { maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-sm tabular-nums">
                      <span className={triggerCellClass("buy", r.down_visual_state ?? "NORMAL")}>
                        {fmtNum(r.down_value, { maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-sm tabular-nums text-slate-700">
                      {fmtNum(r.qty_left, { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {details?.script_name && <ScriptNewsCard symbol={details.script_name} />}
    </div>
  );
}
