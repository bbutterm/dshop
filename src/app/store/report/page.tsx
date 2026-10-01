"use client";

import { byId } from "@/lib/engine";
import { addDays, fmtDay, isoDate, today, weekday } from "@/lib/dates";
import { useApp } from "@/lib/data/provider";
import { pn, rub } from "@/lib/format";

export default function StoreReport() {
  const { db, user } = useApp();
  const store = byId(db.stores, user.storeId)!;
  const issued = db.orders.filter((o) => o.storeId === store.id && o.status === "issued");
  const issuedAt = (o: (typeof issued)[number]) => isoDate(new Date(o.history.find((h) => h.status === "issued")?.at ?? o.updatedAt));

  const monday = addDays(today(), -(weekday(today()) - 1));
  const weeks = Array.from({ length: 6 }).map((_, i) => {
    const from = addDays(monday, -7 * (5 - i));
    const to = addDays(from, 6);
    const list = issued.filter((o) => issuedAt(o) >= from && issuedAt(o) <= to);
    return { from, to, n: list.length };
  });
  const max = Math.max(1, ...weeks.map((w) => w.n));
  const month = issued.filter((o) => issuedAt(o) >= addDays(today(), -30));
  const buyers = new Set(issued.map((o) => o.buyerId));
  const byDist = db.distributors
    .map((d) => {
      const list = month.filter((o) => o.distributorId === d.id);
      return { d, n: list.length, fee: list.length * store.pickupFee };
    })
    .filter((x) => x.n);

  return (
    <div className="stack fade-in" style={{ ["--gap" as string]: "20px" }}>
      <div className="stack" style={{ ["--gap" as string]: "4px" }}>
        <h1 className="h1">Отчёт по выдачам</h1>
        <span className="small muted">Основа для расчёта с поставщиками: {rub(store.pickupFee)} за выданный заказ</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="card card--green stack" style={{ ["--gap" as string]: "2px" }}>
          <span className="kicker" style={{ color: "rgba(255,255,255,.7)" }}>к получению за 30 дней</span>
          <b className="display" style={{ fontSize: 30, fontWeight: 600 }}>{rub(month.length * store.pickupFee)}</b>
        </div>
        <div className="card stack" style={{ ["--gap" as string]: "2px" }}>
          <span className="kicker">выдано за 30 дней</span>
          <b className="display" style={{ fontSize: 30, fontWeight: 600 }}>{month.length}</b>
        </div>
        <div className="card stack" style={{ ["--gap" as string]: "2px" }}>
          <span className="kicker">новых людей в магазине</span>
          <b className="display" style={{ fontSize: 30, fontWeight: 600 }}>{buyers.size}</b>
          <span className="tiny muted">заходят за заказом — и докупают хлеб и молоко</span>
        </div>
      </div>

      <section className="card stack">
        <b>Выдачи по неделям</b>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, alignItems: "end", height: 170 }}>
          {weeks.map((w, i) => (
            <div key={w.from} className="stack" style={{ ["--gap" as string]: "6px", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
              <b className="small mono">{w.n}</b>
              <div
                style={{
                  width: "100%",
                  maxWidth: 46,
                  height: `${(w.n / max) * 110 + 4}px`,
                  borderRadius: "8px 8px 2px 2px",
                  background: i === weeks.length - 1 ? "var(--mustard)" : "var(--green)",
                  border: "1.5px solid var(--ink)",
                }}
              />
              <span className="tiny muted nowrap">{fmtDay(w.from).replace(/ (\S{3})\S*/, " $1")}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Поставщик</th>
              <th className="r">Выдано</th>
              <th className="r">Плата за выдачу</th>
              <th>Расчёт</th>
            </tr>
          </thead>
          <tbody>
            {byDist.map(({ d, n, fee }) => (
              <tr key={d.id}>
                <td>
                  <b>{d.name}</b>
                </td>
                <td className="r mono">{pn(n, ["заказ", "заказа", "заказов"])}</td>
                <td className="r mono">{rub(fee)}</td>
                <td className="muted small">раз в неделю, по отчёту</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
