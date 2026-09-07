import Decimal from "npm:decimal.js@10.4.3";

// All money/qty math in these functions uses this, never native JS numbers —
// floats are not safe for price arithmetic (mirrors the Python `Decimal` usage
// in the original backend).
export { Decimal };

// Python's Decimal.quantize() with no explicit rounding uses the default context,
// which is ROUND_HALF_EVEN ("banker's rounding") and 28 significant digits of precision
// — match both so totals agree exactly.
Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN, precision: 34 });

/** Port of Python's `_d(value, places=2)`: coerce + round-half-even to `places` decimals. */
export function d(value: Decimal.Value | null | undefined, places = 2): Decimal {
  if (value === null || value === undefined) {
    return new Decimal(0).toDecimalPlaces(places);
  }
  return new Decimal(value).toDecimalPlaces(places);
}

/** Floor to a whole number (NSE equities can't be bought/sold fractionally). */
export function floorInt(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_FLOOR);
}

export function toNum(value: Decimal | null | undefined): number | null {
  return value === null || value === undefined ? null : value.toNumber();
}

/**
 * FastAPI/Pydantic serializes Decimal fields as fixed-precision STRINGS, not JSON numbers
 * (confirmed against the live API: `"up_percent":"1.50"`) — match that exactly so the
 * frontend, which already expects this shape, needs no changes.
 */
export function decOut(value: Decimal.Value | null | undefined, places = 2): string | null {
  if (value === null || value === undefined) return null;
  return new Decimal(value).toDecimalPlaces(places).toFixed(places);
}
