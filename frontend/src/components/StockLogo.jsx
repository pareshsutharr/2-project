import { useState } from "react";
import { clearbitLogoUrl } from "../utils/fuzzySearch.js";

export default function StockLogo({ domain, symbol, size = 28 }) {
  const [failed, setFailed] = useState(false);
  const url = clearbitLogoUrl(domain, size * 2);

  if (!url || failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600"
      >
        {symbol?.slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full bg-white object-contain ring-1 ring-slate-100"
      onError={() => setFailed(true)}
    />
  );
}
