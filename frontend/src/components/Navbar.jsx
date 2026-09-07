import { NavLink } from "react-router-dom";
import { Activity, CalendarDays, LayoutDashboard, Newspaper, Settings2, History, TrendingUp, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchNiftyQuote } from "../services/api.js";
import { usePriceDirection } from "../utils/usePriceDirection.js";

const nav = [
  { to: "/news", label: "News", icon: Newspaper },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/config", label: "Config", icon: Settings2 },
  { to: "/trade-history", label: "Trade History", icon: History },
];

function formatNifty(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}

export default function Navbar() {
  const [nifty, setNifty] = useState({ value: null, changePercent: null, loading: true, error: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchNiftyQuote();
        if (!cancelled) {
          setNifty({
            value: data.value,
            changePercent: data.change_percent,
            loading: false,
            error: false,
          });
        }
      } catch {
        if (!cancelled) {
          setNifty((s) => ({ ...s, loading: false, error: true }));
        }
      }
    })();
    const id = setInterval(async () => {
      try {
        const data = await fetchNiftyQuote();
        if (!cancelled) {
          setNifty({
            value: data.value,
            changePercent: data.change_percent,
            loading: false,
            error: false,
          });
        }
      } catch {
        /* keep last */
      }
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const pct = nifty.changePercent;
  const positive = pct != null && pct >= 0;
  const { direction, flash } = usePriceDirection(nifty.value);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 shadow-md backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-4 sm:gap-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
              <Activity className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-slate-900">Temptation Dashboard</p>
              <p className="text-xs text-slate-500">Stock monitoring</p>
            </div>
          </div>

          <div className="hidden h-10 w-px bg-slate-200 sm:block" aria-hidden />

          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">NIFTY 50</span>
            {nifty.loading ? (
              <span className="text-sm text-slate-400">Loading…</span>
            ) : nifty.error ? (
              <span className="text-sm text-slate-400">Unavailable</span>
            ) : (
              <span
                className={[
                  "inline-flex items-center gap-1 rounded-md px-1 text-sm font-semibold tabular-nums text-slate-800 transition-colors duration-500",
                  flash ? (direction === "up" ? "bg-emerald-100" : "bg-rose-100") : "bg-transparent",
                ].join(" ")}
              >
                {direction === "up" ? (
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                ) : direction === "down" ? (
                  <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
                ) : null}
                {formatNifty(nifty.value)}
                {pct != null && (
                  <span className={`ml-1 text-xs font-semibold ${positive ? "text-emerald-600" : "text-rose-600"}`}>
                    ({positive ? "+" : ""}
                    {pct.toFixed(2)}%)
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-1 sm:justify-end" aria-label="Main">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  "group flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-slate-900 text-white shadow-md"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                ].join(" ")
              }
            >
              <Icon className="h-4 w-4 opacity-90" />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
