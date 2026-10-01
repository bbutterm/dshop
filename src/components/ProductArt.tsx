import type { Product } from "@/lib/types";

// Иллюстрации упаковок вместо фото: на пилоте у дистрибьютора нет фотобанка,
// а единый стиль карточек выглядит аккуратнее разнокалиберных снимков.

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

export function ProductArt({
  product,
  size = 120,
  bg = true,
}: {
  product: Pick<Product, "art" | "tint" | "brand" | "name">;
  size?: number;
  bg?: boolean;
}) {
  const c = product.tint;
  const dark = shade(c, -0.28);
  const light = shade(c, 0.35);
  const ink = isLight(c) ? "#17201b" : "#fffdf8";
  const letter = (product.brand || product.name).replace(/[«»"]/g, "").trim().charAt(0).toUpperCase();
  const label = (
    <text x="60" y="68" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="15" fill={dark}>
      {letter}
    </text>
  );

  let body: React.ReactNode;
  switch (product.art) {
    case "box":
      body = (
        <g>
          <path d="M28 44 L60 32 L92 44 L60 56 Z" fill={light} />
          <path d="M28 44 L60 56 L60 96 L28 84 Z" fill={c} />
          <path d="M92 44 L60 56 L60 96 L92 84 Z" fill={dark} />
          <path d="M34 58 L54 65.5 L54 80 L34 72.5 Z" fill="#fffdf8" opacity="0.92" />
          <text x="44" y="76" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="10" fill={dark}>
            {letter}
          </text>
          <path d="M66 62 L86 54.5" stroke={light} strokeWidth="2" opacity="0.6" />
          <path d="M66 68 L80 62.7" stroke={light} strokeWidth="2" opacity="0.4" />
        </g>
      );
      break;
    case "bag":
      body = (
        <g>
          <path d="M36 34 l4 -5 l4 5 l4 -5 l4 5 l4 -5 l4 5 l4 -5 l4 5 l4 -5 l4 5 l4 -5 l4 5 L86 92 Q60 99 34 92 Z" fill={c} />
          <path d="M37 36 L85 36 L84 42 L36 42 Z" fill={dark} opacity="0.35" />
          <path d="M70 40 Q78 62 84 90 Q80 92 76 92 Q72 62 66 40 Z" fill={dark} opacity="0.18" />
          <rect x="44" y="50" width="32" height="26" rx="5" fill="#fffdf8" opacity="0.94" />
          {label}
          <rect x="48" y="71" width="24" height="2" rx="1" fill={c} opacity="0.5" />
        </g>
      );
      break;
    case "bar":
      body = (
        <g transform="rotate(-14 60 64)">
          <rect x="24" y="44" width="72" height="40" rx="4" fill={c} />
          <path d="M80 44 L96 44 L96 84 L80 84 Z" fill="#cfd5d8" />
          <path d="M80 44 L96 60 L96 44 Z" fill="#eef1f2" />
          <rect x="24" y="44" width="72" height="5" fill={dark} opacity="0.35" />
          <rect x="34" y="54" width="36" height="20" rx="10" fill="#fffdf8" opacity="0.94" />
          <text x="52" y="68.5" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="11" fill={dark}>
            {letter}
          </text>
        </g>
      );
      break;
    case "jar":
      body = (
        <g>
          <rect x="42" y="30" width="36" height="12" rx="3" fill={dark} />
          <rect x="44" y="40" width="32" height="5" fill={shade(c, -0.45)} opacity="0.5" />
          <path d="M40 46 Q38 46 38 52 L38 90 Q38 96 46 96 L74 96 Q82 96 82 90 L82 52 Q82 46 80 46 Z" fill={c} />
          <path d="M44 52 L44 88" stroke={light} strokeWidth="4" strokeLinecap="round" opacity="0.55" />
          <rect x="46" y="56" width="28" height="22" rx="4" fill="#fffdf8" opacity="0.94" />
          <text x="60" y="71.5" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="12" fill={dark}>
            {letter}
          </text>
        </g>
      );
      break;
    case "bottle":
      body = (
        <g>
          <rect x="53" y="20" width="14" height="9" rx="2" fill={shade(c, -0.5)} />
          <path d="M54 29 L66 29 L66 38 Q78 44 78 56 L78 92 Q78 98 72 98 L48 98 Q42 98 42 92 L42 56 Q42 44 54 38 Z" fill={c} opacity="0.92" />
          <path d="M47 58 L47 90" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
          <rect x="42" y="60" width="36" height="22" fill="#fffdf8" opacity="0.94" />
          <text x="60" y="75.5" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="12" fill={dark}>
            {letter}
          </text>
        </g>
      );
      break;
    case "can":
      body = (
        <g>
          <path d="M38 40 L38 88 A22 7 0 0 0 82 88 L82 40 Z" fill={c} />
          <ellipse cx="60" cy="40" rx="22" ry="7" fill={light} />
          <ellipse cx="60" cy="40" rx="17" ry="4.6" fill="none" stroke={dark} strokeWidth="1.2" opacity="0.5" />
          <path d="M38 54 L82 54 L82 76 L38 76 Z" fill="#fffdf8" opacity="0.94" />
          <text x="60" y="69.5" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="12" fill={dark}>
            {letter}
          </text>
          <path d="M74 44 L74 86" stroke={dark} strokeWidth="4" opacity="0.18" />
        </g>
      );
      break;
    case "tin":
      body = (
        <g>
          <path d="M34 52 L34 86 A26 8 0 0 0 86 86 L86 52 Z" fill={c} />
          <ellipse cx="60" cy="52" rx="26" ry="8" fill={dark} />
          <ellipse cx="60" cy="50" rx="26" ry="8" fill={light} />
          <rect x="44" y="62" width="32" height="18" rx="3" fill="#fffdf8" opacity="0.94" />
          <text x="60" y="75.5" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="11" fill={dark}>
            {letter}
          </text>
        </g>
      );
      break;
    case "pack":
    default:
      body = (
        <g>
          <path d="M22 50 l4 -3 l0 34 l-4 -3 Z" fill={dark} />
          <path d="M98 50 l-4 -3 l0 34 l4 -3 Z" fill={dark} />
          <path d="M24 46 L96 46 L96 82 L24 82 Z" fill={c} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M24 ${48 + i * 6} l-4 3 l4 3`} fill="none" stroke={dark} strokeWidth="1" />
          ))}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={`r${i}`} d={`M96 ${48 + i * 6} l4 3 l-4 3`} fill="none" stroke={dark} strokeWidth="1" />
          ))}
          <path d="M24 46 L96 46 L96 52 L24 52 Z" fill="#fff" opacity="0.18" />
          <rect x="44" y="54" width="32" height="20" rx="10" fill="#fffdf8" opacity="0.94" />
          <text x="60" y="68.5" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="11" fill={dark}>
            {letter}
          </text>
        </g>
      );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" style={{ color: ink }}>
      {bg && <rect width="120" height="120" rx="18" fill={shade(c, 0.86)} />}
      <ellipse cx="60" cy="100" rx="30" ry="4" fill="#17201b" opacity="0.08" />
      {body}
    </svg>
  );
}
