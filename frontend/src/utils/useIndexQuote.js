import { useEffect, useState } from "react";

/**
 * Polls a market index quote fetcher (e.g. Nifty/Sensex) on an interval.
 */
export function useIndexQuote(fetchFn, intervalMs = 15000) {
  const [quote, setQuote] = useState({ value: null, changePercent: null, loading: true, error: false });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchFn();
        if (!cancelled) {
          setQuote({
            value: data.value,
            changePercent: data.change_percent,
            loading: false,
            error: false,
          });
        }
      } catch {
        if (!cancelled) {
          setQuote((s) => ({ ...s, loading: false, error: true }));
        }
      }
    };
    load();
    const id = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fetchFn, intervalMs]);

  return quote;
}
