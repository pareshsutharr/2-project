import * as XLSX from "xlsx";

function fmtBoughtOn(r) {
  if (!r.trade_date || !r.trade_time) return "";
  const d = new Date(`${r.trade_date}T${r.trade_time}`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function realizedPnl(r) {
  if (r.sell_price == null || r.sell_qty == null) return null;
  return (Number(r.sell_price) - Number(r.buy_price)) * Number(r.sell_qty);
}

export function exportTradesToExcel(trades, filename, { includeScript = false } = {}) {
  const rows = trades.map((r, i) => {
    const row = { "Sr. No.": i + 1 };
    if (includeScript) row["Script"] = r.script_name;
    Object.assign(row, {
      "Bought On": fmtBoughtOn(r),
      "Buy Price": r.buy_price != null ? Number(r.buy_price) : null,
      Qty: r.sell_qty != null ? Number(r.sell_qty) : null,
      "Sell Price": r.sell_price != null ? Number(r.sell_price) : null,
      "Sold On": r.updated_at ? new Date(r.updated_at).toLocaleString() : "",
      "P&L": realizedPnl(r),
    });
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Trade Log");
  XLSX.writeFile(workbook, filename);
}
