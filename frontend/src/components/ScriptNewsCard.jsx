import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, Newspaper, RefreshCw } from "lucide-react";
import { fetchScriptNews } from "../services/api.js";

function timeAgo(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "Just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ScriptNewsCard({ symbol }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (isRefresh = false) => {
      if (!symbol) return;
      setError("");
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const data = await fetchScriptNews(symbol);
        setItems(data.items || []);
      } catch {
        setError(`Could not load news for ${symbol}.`);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [symbol]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const sorted = [...items].sort(
    (a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
  );
  const hasHighRisk = sorted.some((item) => item.isHighRisk);

  return (
    <div className="rounded-2xl bg-white shadow-md ring-1 ring-slate-100">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
            <Newspaper className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{symbol || "—"} News</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {loading ? "Loading…" : `${sorted.length} recent article${sorted.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading || refreshing || !symbol}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {hasHighRisk && (
        <div className="mx-6 mt-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-600" />
          <div>
            <p className="font-semibold">High Volatility Warning</p>
            <p className="text-rose-800">Major news or corporate event detected.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          {error}
        </div>
      )}

      <div className="max-h-[480px] space-y-2 overflow-y-auto p-6 pt-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading news...
          </div>
        ) : sorted.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
            {error ? "Nothing to show." : `No recent news found for ${symbol}.`}
          </p>
        ) : (
          sorted.map((item, idx) => (
            <a
              key={`${item.url}-${idx}`}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className={[
                "block rounded-xl border px-4 py-3 transition hover:bg-slate-50",
                item.isHighRisk ? "border-rose-200 bg-rose-50/40" : "border-slate-100 bg-white",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                {item.isHighRisk && (
                  <span className="flex-shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                    High Risk
                  </span>
                )}
              </div>
              {item.snippet && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.snippet}</p>}
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                <span className="font-medium text-slate-500">{item.source}</span>
                <span>•</span>
                <span>{timeAgo(item.publishedAt)}</span>
                <span className="ml-auto inline-flex items-center gap-1 text-slate-400">
                  Read <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
