import { NSE_STOCKS } from "../data/nseStocks.js";

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

/**
 * Lower score = better match. Returns null when the query is too different
 * from the stock to be a plausible match (even allowing for typos).
 */
function scoreStock(query, stock) {
  const symbol = stock.symbol.toLowerCase();
  const name = stock.name.toLowerCase();
  const nameWords = name.split(/[\s&,.-]+/).filter(Boolean);

  if (symbol === query) return 0;
  if (symbol.startsWith(query)) return 1;
  if (name.startsWith(query)) return 2;
  if (symbol.includes(query)) return 3;
  if (name.includes(query)) return 4;

  let best = Infinity;
  for (const candidate of [symbol, ...nameWords]) {
    if (Math.abs(candidate.length - query.length) > 3) continue;
    const distance = levenshtein(query, candidate);
    const normalized = distance / Math.max(candidate.length, query.length);
    if (normalized < best) best = normalized;
  }

  // Allow roughly 1-2 mistyped characters depending on word length.
  const threshold = query.length <= 3 ? 0.34 : 0.4;
  if (best <= threshold) return 5 + best;
  return null;
}

export function fuzzyMatchStocks(query, { stocks = NSE_STOCKS, limit = 8 } = {}) {
  const q = query?.trim().toLowerCase();
  if (!q) return [];

  const scored = [];
  for (const stock of stocks) {
    const score = scoreStock(q, stock);
    if (score !== null) scored.push({ ...stock, _score: score });
  }
  scored.sort((a, b) => a._score - b._score);
  return scored.slice(0, limit);
}

export function clearbitLogoUrl(domain, size = 64) {
  if (!domain) return null;
  return `https://logo.clearbit.com/${domain}?size=${size}`;
}
