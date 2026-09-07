import { Pencil, Trash2 } from "lucide-react";
import ToggleButton from "./ToggleButton.jsx";

function fmtNum(n, opts = {}) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, ...opts }).format(n);
}

export default function ScriptRow({ script, onEdit, onDelete, onToggleActive, busy }) {
  return (
    <tr className="border-b border-slate-100 transition hover:bg-slate-50/80">
      <td className="whitespace-nowrap px-4 py-3">
        <ToggleButton
          checked={!!script.active}
          onChange={(v) => onToggleActive(script.id, v)}
          disabled={busy}
          ariaLabel={`Toggle ${script.name}`}
        />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold tracking-wide text-slate-900">{script.name}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-slate-700">{fmtNum(script.up_percent)}%</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-slate-700">{fmtNum(script.down_percent)}%</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-slate-700">
        {fmtNum(script.total_invest_amount, { maximumFractionDigits: 2 })}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-slate-700">{script.invest_slots}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-slate-700">{script.max_buy}</td>
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(script)}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(script)}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
