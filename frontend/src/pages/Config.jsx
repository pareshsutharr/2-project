import { useCallback, useEffect, useState } from "react";
import ConfigForm from "../components/ConfigForm.jsx";
import ScriptTable from "../components/ScriptTable.jsx";
import { createScript, deleteScript, fetchScripts, updateScript } from "../services/api.js";

export default function Config() {
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const data = await fetchScripts();
      setScripts(Array.isArray(data) ? data : []);
    } catch {
      setLoadError("Could not load scripts. Is the API running?");
      setScripts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    try {
      if (editing) {
        const updated = await updateScript(editing.id, payload);
        setScripts((list) => list.map((s) => (s.id === updated.id ? updated : s)));
        setEditing(null);
        setToast("Script updated");
      } else {
        const created = await createScript(payload);
        setScripts((list) => [created, ...list]);
        setToast("Script added");
      }
    } catch (e) {
      const msg = e.response?.data?.detail;
      setToast(typeof msg === "string" ? msg : "Save failed. Check validation.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (script) => {
    if (!window.confirm(`Delete ${script.name}?`)) return;
    setBusyId(script.id);
    try {
      await deleteScript(script.id);
      setScripts((list) => list.filter((s) => s.id !== script.id));
      if (editing?.id === script.id) setEditing(null);
      setToast("Script deleted");
    } catch {
      setToast("Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (id, active) => {
    const prev = scripts.find((s) => s.id === id);
    if (!prev) return;
    setBusyId(id);
    setScripts((list) => list.map((s) => (s.id === id ? { ...s, active } : s)));
    try {
      const updated = await updateScript(id, {
        name: prev.name,
        up_percent: Number(prev.up_percent),
        down_percent: Number(prev.down_percent),
        total_invest_amount: Number(prev.total_invest_amount),
        invest_slots: prev.invest_slots,
        max_buy: prev.max_buy,
        active,
      });
      setScripts((list) => list.map((s) => (s.id === id ? updated : s)));
    } catch {
      setScripts((list) => list.map((s) => (s.id === id ? { ...s, active: prev.active } : s)));
      setToast("Could not update active state");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {loadError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          {loadError}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[520px,1fr] lg:items-start">
        <ConfigForm
          editingId={editing?.id}
          initialValues={editing}
          onSubmit={handleSubmit}
          submitting={submitting}
          onCancelEdit={() => setEditing(null)}
        />
        <div>
          {loading ? (
            <div className="flex h-48 items-center justify-center rounded-2xl bg-white text-sm text-slate-500 shadow-md">
              Loading scripts…
            </div>
          ) : (
            <ScriptTable
              scripts={scripts}
              onEdit={setEditing}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
              busyId={busyId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
