import { useEffect, useRef, useState } from "react";

/**
 * Tracks whether a numeric value most recently ticked up or down, plus a brief "flash" flag
 * right after each change — for live price-tick indicators (arrow icon + highlight pulse).
 */
export function usePriceDirection(value, flashMs = 900) {
  const prevRef = useRef(value);
  const [direction, setDirection] = useState(null); // "up" | "down" | null
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const prev = prevRef.current;
    const next = value == null ? null : Number(value);
    const prevNum = prev == null ? null : Number(prev);
    if (next != null && prevNum != null && next !== prevNum) {
      setDirection(next > prevNum ? "up" : "down");
      setFlash(true);
      const t = setTimeout(() => setFlash(false), flashMs);
      prevRef.current = value;
      return () => clearTimeout(t);
    }
    prevRef.current = value;
  }, [value, flashMs]);

  return { direction, flash };
}
