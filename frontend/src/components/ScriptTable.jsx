import ScriptRow from "./ScriptRow.jsx";

export default function ScriptTable({ scripts, onEdit, onDelete, onToggleActive, busyId }) {
  return (
    <div className="animate-fade-in rounded-2xl bg-white shadow-md ring-1 ring-slate-100">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate-900">📊 Scripts</h2>
        <p className="mt-0.5 text-sm text-slate-500">Manage monitored symbols and thresholds.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-left">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="whitespace-nowrap px-4 py-3">Active</th>
              <th className="whitespace-nowrap px-4 py-3">Script</th>
              <th className="whitespace-nowrap px-4 py-3">Up %</th>
              <th className="whitespace-nowrap px-4 py-3">Down %</th>
              <th className="whitespace-nowrap px-4 py-3">Invest</th>
              <th className="whitespace-nowrap px-4 py-3">Slots</th>
              <th className="whitespace-nowrap px-4 py-3">Max buy</th>
              <th className="whitespace-nowrap px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {scripts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-500">
                  No scripts yet. Add one from the form.
                </td>
              </tr>
            ) : (
              scripts.map((s) => (
                <ScriptRow
                  key={s.id}
                  script={s}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onToggleActive={onToggleActive}
                  busy={busyId === s.id}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
