import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, History } from "lucide-react";
import { fetchExecuteRows, fetchScripts } from "../services/api.js";
import { exportTradesToExcel } from "../utils/exportTrades.js";

function fmtNum(v, opts = {}) {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, ...opts }).format(n);
}

function fmtBoughtOn(r) {
  if (!r.trade_date || !r.trade_time) return "—";
  const d = new Date(`${r.trade_date}T${r.trade_time}`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function realizedPnl(r) {
  if (r.sell_price == null || r.sell_qty == null) return null;
  return (Number(r.sell_price) - Number(r.buy_price)) * Number(r.sell_qty);
}

export default function TradeHistory() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const scripts = await fetchScripts();
      const perScript = await Promise.all(
        scripts.map(async (s) => {
          const resp = await fetchExecuteRows(s.id);
          return (resp.rows || [])
            .filter((r) => r.is_trade_complete)
            .map((r) => ({ ...r, script_id: s.id, script_name: s.name }));
        })
      );
      const all = perScript.flat().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      setTrades(all);
    } catch {
      setError("Could not load trade history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalPnl = trades.reduce((sum, r) => sum + (realizedPnl(r) ?? 0), 0);

  const handleExport = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    exportTradesToExcel(trades, `trade-history-${stamp}.xlsx`, { includeScript: true });
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
            <History className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Trade History</h1>
            <p className="mt-1 text-sm text-slate-500">Completed trades across every script.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={loading || trades.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Export to Excel
        </button>
      </section>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          {error}
        </div>
      )}

      <section className="rounded-2xl bg-white shadow-md ring-1 ring-slate-100">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Completed Trades</h2>
            <p className="mt-0.5 text-sm text-slate-500">{trades.length} trade{trades.length === 1 ? "" : "s"} booked</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total P&amp;L</p>
            <p className={`text-lg font-semibold tabular-nums ${totalPnl >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {fmtNum(totalPnl, { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1000px] w-full text-left">
            <thead className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-3">Sr. No.</th>
                <th className="px-3 py-3">Script</th>
                <th className="px-3 py-3">Bought On</th>
                <th className="px-3 py-3">Buy Price</th>
                <th className="px-3 py-3">Qty</th>
                <th className="px-3 py-3">Sell Price</th>
                <th className="px-3 py-3">Sold On</th>
                <th className="px-3 py-3">P&amp;L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">
                    Loading trade history...
                  </td>
                </tr>
              ) : trades.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">
                    No completed trades yet.
                  </td>
                </tr>
              ) : (
                trades.map((r, i) => {
                  const pnl = realizedPnl(r);
                  return (
                    <tr key={`${r.script_id}-${r.id}`} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 text-sm text-slate-700">{i + 1}</td>
                      <td className="px-3 py-2.5 text-sm font-semibold text-slate-900">
                        <Link to={`/history/${r.script_id}`} className="hover:underline">
                          {r.script_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-slate-700">{fmtBoughtOn(r)}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-slate-700">
                        {fmtNum(r.buy_price, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-slate-700">
                        {fmtNum(r.sell_qty, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-slate-700">
                        {fmtNum(r.sell_price, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-slate-700">
                        {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-sm font-semibold tabular-nums ${pnl >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {fmtNum(pnl, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
