export function rub(n: number): string {
  const v = Math.round(n * 100) / 100;
  const hasKop = Math.abs(v % 1) > 0.001;
  return (
    v.toLocaleString("ru-RU", {
      minimumFractionDigits: hasKop ? 2 : 0,
      maximumFractionDigits: 2,
    }) + " ₽"
  );
}

/** plural(5, ["заказ", "заказа", "заказов"]) */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export function pn(n: number, forms: [string, string, string]): string {
  return `${n} ${plural(n, forms)}`;
}

export function percent(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits).replace(".", ",")} %`;
}

export function phoneFmt(p: string): string {
  const d = p.replace(/\D/g, "").replace(/^8/, "7");
  if (d.length !== 11) return p;
  return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
