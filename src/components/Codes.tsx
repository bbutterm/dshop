import qrcode from "qrcode-generator";

/** QR с кодом выдачи — сканируется камерой продавца */
export function QR({ value, size = 132 }: { value: string; size?: number }) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" aria-label={`QR-код ${value}`}>
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#fffdf8" />
      <path d={d} fill="currentColor" />
    </svg>
  );
}

// Code 128 (набор B) — маркировка заказа на пакете
const C128 = (
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 " +
  "221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 " +
  "221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 " +
  "212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 " +
  "231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 " +
  "231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 " +
  "314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 " +
  "112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 " +
  "214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 " +
  "114131 311141 411131 211412 211214 211232 2331112"
).split(" ");

function code128B(text: string): number[] {
  const vals = [104];
  for (const ch of text) {
    const v = ch.charCodeAt(0) - 32;
    vals.push(v >= 0 && v < 95 ? v : 0);
  }
  const check = vals.reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0) % 103;
  vals.push(check, 106);
  return vals.flatMap((v) => [...C128[v]].map(Number));
}

export function Barcode({ value, height = 44, width = 200 }: { value: string; height?: number; width?: number }) {
  const widths = [0, ...code128B(value), 0];
  const total = widths.reduce((a, b) => a + b, 0) + 20;
  let x = 10;
  const rects: React.ReactNode[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 1 && w > 0) rects.push(<rect key={i} x={x} y={0} width={w} height={10} />);
    x += w;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${total} 10`} preserveAspectRatio="none" fill="currentColor" aria-label={value} shapeRendering="crispEdges">
      {rects}
    </svg>
  );
}

export function CodeDigits({ code, big = false }: { code: string; big?: boolean }) {
  return (
    <span className="mono" style={{ fontSize: big ? 38 : 20, fontWeight: 600, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
      {code.slice(0, 3)}
      <span style={{ opacity: 0.3, margin: "0 0.12em" }}>·</span>
      {code.slice(3)}
    </span>
  );
}
