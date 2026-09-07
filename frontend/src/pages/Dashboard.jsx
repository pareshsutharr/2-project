import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, TrendingDown, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MonitoringTable from "../components/MonitoringTable.jsx";
import StatCard from "../components/StatCard.jsx";
import { fetchDashboardMonitoring, fetchDashboardSummary } from "../services/api.js";

function toNum(v) {
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [monitoring, setMonitoring] = useState({ rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [s, m] = await Promise.all([fetchDashboardSummary(), fetchDashboardMonitoring()]);
      setSummary(s);
      setMonitoring(m);
    } catch {
      setError("Could not load dashboard data. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Polling (no websockets yet)
  useEffect(() => {
    const id = setInterval(() => {
      load();
    }, 5000);
    return () => clearInterval(id);
  }, [load]);

  const invested = toNum(summary?.invested_amount) ?? 0;
  const currentValue = toNum(summary?.current_value) ?? 0;
  const deltaPct = useMemo(() => {
    if (!invested) return null;
    return ((currentValue - invested) / invested) * 100;
  }, [invested, currentValue]);

  const currentTone = currentValue >= invested ? "success" : "danger";

  const handleExecute = (row) => {
    navigate(`/execute/${row.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="pt-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Premium monitoring view powered by backend APIs.</p>
          </div>
          <div className="text-xs font-semibold text-slate-400">
            Refresh: <span className="text-slate-700">5s polling</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Invested Amount"
          value={summary?.invested_amount}
          subtitleLabel="Current Value"
          subtitleValue={summary?.current_value}
          tone={currentTone}
          delta={deltaPct}
          iconAlign="center"
        />
        <StatCard title="Profit Made" icon={TrendingUp} value={summary?.profit} tone="success" />
        <StatCard title="Loss Booked" icon={TrendingDown} value={summary?.loss} tone="danger" />
        <StatCard title="Holding Positions" icon={BarChart3} value={summary?.holdings_count} tone="neutral" />
        <div className="grid h-full grid-rows-2 gap-2">
          <div className="rounded-2xl bg-gradient-to-b from-emerald-50 to-white p-3 shadow-md ring-1 ring-emerald-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Live Buy Alerts</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{summary?.buy_alerts ?? 0}</p>
              </div>
              <TrendingUp className="h-4 w-4 text-emerald-700" />
            </div>
          </div>
          <div className="rounded-2xl bg-gradient-to-b from-rose-50 to-white p-3 shadow-md ring-1 ring-rose-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Live Sell Alerts</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{summary?.sell_alerts ?? 0}</p>
              </div>
              <TrendingDown className="h-4 w-4 text-rose-700" />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-56 items-center justify-center rounded-2xl bg-white text-sm text-slate-500 shadow-md">
          Loading dashboard…
        </div>
      ) : (
        <MonitoringTable rows={monitoring?.rows || []} onExecute={handleExecute} />
      )}
    </div>
  );
}

