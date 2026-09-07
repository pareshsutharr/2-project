export default function Badge({ tone = "neutral", children }) {
  const styles =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70"
      : tone === "danger"
        ? "bg-rose-50 text-rose-700 ring-rose-200/70"
        : tone === "warning"
          ? "bg-amber-50 text-amber-800 ring-amber-200/70"
          : "bg-slate-50 text-slate-700 ring-slate-200/70";

  return (
    <span className={["inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ring-1", styles].join(" ")}>
      {children}
    </span>
  );
}

