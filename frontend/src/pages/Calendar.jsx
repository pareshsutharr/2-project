import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ExternalLink, RefreshCw } from "lucide-react";
import { fetchCalendar } from "../services/api.js";

const COLUMNS = [
  { key: "meetings", label: "Meetings", hint: "Board Meeting / AGM" },
  { key: "corporate_actions", label: "Corporate Actions", hint: "Dividend / Split" },
  { key: "results", label: "Results / Earnings", hint: "Quarterly results" },
  { key: "regulatory", label: "Regulatory & Risk Flags", hint: "SEBI / Raid / Resignation / Loss" },
];

function fmtDateOnly(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function EventEntry({ event }) {
  const scheduled = fmtDateOnly(event.eventDate);
  const filed = !scheduled ? fmtDateTime(event.publishedAt) : null;
  const label = scheduled || (filed ? `Filed ${filed}` : "Recent");
  const tone = scheduled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700";

  return (
    <a
      href={event.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 transition hover:bg-slate-100"
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
          {label}
        </span>
        <ExternalLink className="h-3 w-3 flex-shrink-0 text-slate-400" />
      </div>
      <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-800">{event.title}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{event.source}</p>
    </a>
  );
}

function CalendarCell({ events }) {
  if (!events || events.length === 0) {
    return <span className="text-sm text-slate-300">—</span>;
  }
  return (
    <div className="space-y-1.5">
      {events.map((event, idx) => (
        <EventEntry key={`${event.url}-${idx}`} event={event} />
      ))}
    </div>
  );
}

export default function Calendar() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    setError("");
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchCalendar();
      setRows(data.rows || []);
    } catch {
      setError("Could not load the calendar.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
            <CalendarDays className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Calendar</h1>
            <p className="mt-1 text-sm text-slate-500">
              Sourced from NSE's corporate filings. Entries drop off on their own once the date has passed.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </section>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          {error}
        </div>
      )}

      <section className="rounded-2xl bg-white shadow-md ring-1 ring-slate-100">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] table-fixed text-left">
            <thead className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="w-[140px] px-4 py-3">Script</th>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="px-4 py-3 align-bottom">
                    <div>{col.label}</div>
                    <div className="mt-0.5 text-[10px] font-medium normal-case tracking-normal text-slate-400">
                      {col.hint}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-6 py-10 text-center text-sm text-slate-500">
                    Loading calendar...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-6 py-10 text-center text-sm text-slate-500">
                    No scripts configured yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.script_id} className="align-top">
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">{row.symbol}</td>
                    {COLUMNS.map((col) => (
                      <td key={col.key} className="px-4 py-3 align-top">
                        <CalendarCell events={row[col.key]} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
