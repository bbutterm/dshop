import { shelfSum } from "@/lib/engine";
import { addDays, today, weekday } from "@/lib/dates";
import type { DB } from "@/lib/types";

/** Метрики пилота из бизнес-плана: спрос, чек, повторность, невыкуп, время выдачи, разница с полкой */
export function pilotMetrics(db: DB) {
  const paid = db.orders.filter((o) => o.payment.paidAt && o.status !== "cancelled");
  const finished = db.orders.filter((o) => ["issued", "unclaimed", "returned"].includes(o.status));
  const issued = db.orders.filter((o) => o.status === "issued");

  const monday = addDays(today(), -(weekday(today()) - 1));
  const weeks = Array.from({ length: 6 }).map((_, i) => {
    const from = addDays(monday, -7 * (5 - i));
    const to = addDays(from, 6);
    const list = paid.filter((o) => o.deliveryDate >= from && o.deliveryDate <= to);
    return { from, n: list.length, sum: list.reduce((s, o) => s + o.total - o.refund, 0) };
  });

  const perBuyer = new Map<string, number>();
  for (const o of paid) perBuyer.set(o.buyerId, (perBuyer.get(o.buyerId) ?? 0) + 1);
  const buyers = perBuyer.size;
  const repeat = [...perBuyer.values()].filter((n) => n > 1).length;

  const hours = issued
    .map((o) => {
      const a = o.history.find((h) => h.status === "at_store")?.at;
      const b = o.history.find((h) => h.status === "issued")?.at;
      return a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 3600_000 : null;
    })
    .filter((x): x is number => x !== null);

  const shelf = issued.reduce((s, o) => s + shelfSum(db, o.items), 0);
  const spent = issued.reduce((s, o) => s + o.total, 0);

  return {
    weeks,
    avgPerWeek: weeks.slice(-4).reduce((s, w) => s + w.n, 0) / 4,
    avgCheck: paid.length ? paid.reduce((s, o) => s + o.total - o.refund, 0) / paid.length : 0,
    buyers,
    repeatShare: buyers ? repeat / buyers : 0,
    unclaimedShare: finished.length ? finished.filter((o) => o.status !== "issued").length / finished.length : 0,
    pickupHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 0,
    shelfGap: shelf ? 1 - spent / shelf : 0,
    gmv: paid.reduce((s, o) => s + o.total - o.refund, 0),
    paidCount: paid.length,
  };
}
