import { useCallback, useEffect, useMemo, useState } from "react";
import ToggleButton from "./ToggleButton.jsx";
import StockLogo from "./StockLogo.jsx";
import { validateScriptName } from "../services/api.js";
import { fuzzyMatchStocks } from "../utils/fuzzySearch.js";

const emptyForm = {
  name: "",
  up_percent: "",
  down_percent: "",
  total_invest_amount: "",
  invest_slots: "",
  max_buy: "1",
  active: true,
};

function parsePositiveNum(raw) {
  const n = Number(raw);
  if (raw === "" || Number.isNaN(n)) return null;
  return n;
}

export default function ConfigForm({
  editingId,
  initialValues,
  onSubmit,
  submitting,
  onCancelEdit,
}) {
  const [form, setForm] = useState(emptyForm);
  const [nameError, setNameError] = useState("");
  const [validatingName, setValidatingName] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  useEffect(() => {
    if (editingId && initialValues) {
      setForm({
        name: initialValues.name ?? "",
        up_percent: String(initialValues.up_percent ?? ""),
        down_percent: String(initialValues.down_percent ?? ""),
        total_invest_amount: String(initialValues.total_invest_amount ?? ""),
        invest_slots: String(initialValues.invest_slots ?? ""),
        max_buy: String(initialValues.max_buy ?? ""),
        active: Boolean(initialValues.active),
      });
      setNameError("");
      setFieldErrors({});
    } else if (!editingId) {
      setForm(emptyForm);
      setNameError("");
      setFieldErrors({});
    }
  }, [editingId, initialValues]);

  const validateFields = useCallback(() => {
    const errs = {};
    const req = [
      ["up_percent", "Up (%)"],
      ["down_percent", "Down (%)"],
      ["total_invest_amount", "Total invest"],
      ["invest_slots", "Slots"],
      ["max_buy", "Max buy"],
    ];
    for (const [key, label] of req) {
      const v = parsePositiveNum(form[key]);
      if (form[key] === "" || v == null || v <= 0) {
        errs[key] = `${label} must be a number greater than 0`;
      }
    }
    if (!form.name?.trim()) {
      errs.name = "Script name is required";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }, [form]);

  const debouncedValidateName = useMemo(() => {
    let t;
    return (name) => {
      clearTimeout(t);
      const trimmed = name?.trim().toUpperCase();
      if (!trimmed) {
        setNameError("");
        setValidatingName(false);
        return;
      }
      setValidatingName(true);
      t = setTimeout(async () => {
        try {
          const res = await validateScriptName(trimmed);
          if (!res.valid) {
            setNameError("Script does not exist");
          } else {
            setNameError("");
          }
        } catch {
          setNameError("Could not validate script");
        } finally {
          setValidatingName(false);
        }
      }, 450);
    };
  }, []);

  useEffect(() => {
    if (!form.name?.trim()) {
      setNameError("");
      return;
    }
    debouncedValidateName(form.name);
    return () => {};
  }, [form.name, debouncedValidateName]);

  const handleChange = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const handleNameChange = (value) => {
    handleChange("name", value.toUpperCase());
    const matches = fuzzyMatchStocks(value);
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
    setHighlightIndex(-1);
  };

  const selectSuggestion = (stock) => {
    handleChange("name", stock.symbol);
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlightIndex(-1);
  };

  const handleNameKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[highlightIndex]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setHighlightIndex(-1);
    }
  };

  const nameOk = form.name?.trim() && !nameError && !validatingName;
  const numbersOk =
    parsePositiveNum(form.up_percent) > 0 &&
    parsePositiveNum(form.down_percent) > 0 &&
    parsePositiveNum(form.total_invest_amount) > 0 &&
    parsePositiveNum(form.invest_slots) > 0 &&
    parsePositiveNum(form.max_buy) > 0;

  const canSubmit = nameOk && numbersOk && !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateFields()) return;
    if (nameError || validatingName) return;
    const payload = {
      name: form.name.trim().toUpperCase(),
      up_percent: parsePositiveNum(form.up_percent),
      down_percent: parsePositiveNum(form.down_percent),
      total_invest_amount: parsePositiveNum(form.total_invest_amount),
      invest_slots: Math.round(parsePositiveNum(form.invest_slots)),
      max_buy: Math.round(parsePositiveNum(form.max_buy)),
      active: form.active,
    };
    await onSubmit(payload);
    if (!editingId) {
      setForm(emptyForm);
      setNameError("");
    }
  };

  return (
    <div className="animate-fade-in rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100 sm:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Script configuration</h2>
          <p className="mt-1 text-sm text-slate-500">
            {editingId ? "Update fields and save." : "Add a monitored script with alert thresholds."}
          </p>
        </div>
        {editingId && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="shrink-0 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel edit
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="relative">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Script name
          </label>
          <input
            type="text"
            autoComplete="off"
            value={form.name}
            onChange={(e) => handleNameChange(e.target.value)}
            onKeyDown={handleNameKeyDown}
            onFocus={() => setShowSuggestions(suggestions.length > 0)}
            onBlur={() => setShowSuggestions(false)}
            placeholder="e.g. RELIANCE"
            className={`w-full rounded-xl border bg-slate-50/80 px-4 py-2.5 text-sm font-medium tracking-wide text-slate-900 outline-none transition placeholder:text-slate-400 focus:bg-white focus:ring-2 ${
              nameError ? "border-rose-300 focus:ring-rose-200" : "border-slate-200 focus:border-emerald-500 focus:ring-emerald-100"
            }`}
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              {suggestions.map((stock, i) => (
                <li key={stock.symbol}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectSuggestion(stock);
                    }}
                    onMouseEnter={() => setHighlightIndex(i)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
                      i === highlightIndex ? "bg-emerald-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <StockLogo domain={stock.domain} symbol={stock.symbol} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{stock.symbol}</span>
                      <span className="block truncate text-xs text-slate-500">{stock.name}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 flex min-h-[1.25rem] items-center gap-2 text-xs">
            {validatingName && <span className="text-slate-400">Checking symbol…</span>}
            {nameError && <span className="font-medium text-rose-600">{nameError}</span>}
          </div>
          {fieldErrors.name && <p className="text-xs font-medium text-rose-600">{fieldErrors.name}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { key: "up_percent", label: "Up (%)" },
            { key: "down_percent", label: "Down (%)" },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
              {fieldErrors[key] && <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors[key]}</p>}
            </div>
          ))}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total invest amount
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.total_invest_amount}
            onChange={(e) => handleChange("total_invest_amount", e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          />
          {fieldErrors.total_invest_amount && (
            <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors.total_invest_amount}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Invest in slots
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.invest_slots}
              onChange={(e) => handleChange("invest_slots", e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            />
            {fieldErrors.invest_slots && (
              <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors.invest_slots}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Max buy
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.max_buy}
              disabled
              readOnly
              title="Disabled — not currently used by the trading logic"
              className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-400 outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">Disabled for now — not used by the trading logic yet.</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Active</p>
            <p className="text-xs text-slate-500">Green = monitoring on</p>
          </div>
          <ToggleButton checked={form.active} onChange={(v) => handleChange("active", v)} ariaLabel="Script active" />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitting ? "Saving…" : editingId ? "Update Script" : "Add Script"}
        </button>
      </form>
    </div>
  );
}
