import { ArrowDownRight, ArrowUpRight } from "lucide-react";

function formatMoney(n) {
  if (n == null) return "—";
  const num = Number(n);
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(num);
}

export default function StatCard({
  title,
  icon: Icon,
  value,
  subtitleLabel,
  subtitleValue,
  tone = "neutral", // neutral | success | danger
  delta = null, // number; optional for arrow indicator
  iconAlign = "top", // top | center
}) {
  const toneStyles =
    tone === "success"
      ? "from-emerald-50 to-white ring-emerald-100"
      : tone === "danger"
        ? "from-rose-50 to-white ring-rose-100"
        : "from-slate-50 to-white ring-slate-100";

  const deltaPositive = typeof delta === "number" ? delta >= 0 : null;

  return (
    <div
      className={[
        "group rounded-2xl bg-gradient-to-b p-5 shadow-md ring-1 transition",
        "hover:shadow-lg hover:-translate-y-0.5",
        toneStyles,
      ].join(" ")}
    >
      <div className={`flex justify-between gap-4 ${iconAlign === "center" ? "items-center" : "items-start"}`}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{formatMoney(value)}</p>
            {deltaPositive != null && (
              <span
                className={[
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold",
                  deltaPositive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                ].join(" ")}
              >
                {deltaPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {Math.abs(delta).toFixed(2)}%
              </span>
            )}
          </div>
          {subtitleLabel && (
            <p className="mt-2 text-sm text-slate-600">
              <span className="text-slate-500">{subtitleLabel}:</span>{" "}
              <span className="font-semibold tabular-nums text-slate-800">{formatMoney(subtitleValue)}</span>
            </p>
          )}
        </div>

        {Icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 transition group-hover:shadow-md">
            <Icon className="h-5 w-5 text-slate-700" />
          </div>
        )}
      </div>
    </div>
  );
}

