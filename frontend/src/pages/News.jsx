import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Newspaper } from "lucide-react";
import { fetchScripts } from "../services/api.js";
import ScriptNewsCard from "../components/ScriptNewsCard.jsx";

export default function News() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const selected = searchParams.get("symbol") || "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError("");
      try {
        const data = await fetchScripts();
        if (cancelled) return;
        setScripts(data || []);
        if (!selected && data?.length) {
          setSearchParams({ symbol: data[0].name }, { replace: true });
        }
      } catch {
        if (!cancelled) setError("Could not load scripts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectSymbol = useCallback(
    (name) => {
      setSearchParams({ symbol: name });
    },
    [setSearchParams]
  );

  return (
    <div className="space-y-6">
      <section className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
          <Newspaper className="h-5 w-5 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">News</h1>
          <p className="mt-1 text-sm text-slate-500">Real-time news and corporate action risk flags per script.</p>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-2xl bg-white text-sm text-slate-500 shadow-md">
          Loading scripts…
        </div>
      ) : scripts.length === 0 ? (
        <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-500 shadow-md">
          No scripts configured yet. Add one from Config to see its news here.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-3 shadow-md ring-1 ring-slate-100">
            {scripts.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectSymbol(s.name)}
                className={[
                  "rounded-xl px-3 py-2 text-sm font-semibold transition",
                  s.name === selected
                    ? "bg-slate-900 text-white shadow-md"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                ].join(" ")}
              >
                {s.name}
              </button>
            ))}
          </div>

          {selected && <ScriptNewsCard symbol={selected} />}
        </>
      )}
    </div>
  );
}
