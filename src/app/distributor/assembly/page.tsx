"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AlertTriangle, PackageCheck, Printer, Send, Truck } from "lucide-react";
import { PageHead } from "@/components/cabinet/CabinetShell";
import { StatusChip } from "@/components/StatusChip";
import { byId } from "@/lib/engine";
import { fmtRelDay } from "@/lib/dates";
import { useAction, useApp } from "@/lib/data/provider";
import { pn, rub } from "@/lib/format";
import { ordersOf } from "../lib";
import styles from "./assembly.module.css";

function Assembly() {
  const { db, user } = useApp();
  const { run, pending } = useAction();
  const params = useSearchParams();
  const orders = ordersOf(db, user);
  const open = orders.filter((o) => ["placed", "confirmed", "assembled"].includes(o.status));
  const dates = [...new Set(open.map((o) => o.deliveryDate))].sort();
  const [date, setDate] = useState(params.get("date") ?? dates[0] ?? "");
  const [driver, setDriver] = useState("Алексей Т.");
  const [vehicle, setVehicle] = useState("ГАЗель Т 482 ОК");

  const day = open.filter((o) => o.deliveryDate === date);
  const placed = day.filter((o) => o.status === "placed");
  const confirmed = day.filter((o) => o.status === "confirmed");
  const assembled = day.filter((o) => o.status === "assembled");
  const work = [...confirmed, ...assembled];
  const stores = [...new Set(work.map((o) => o.storeId))];
  const toReturn = orders.filter((o) => o.status === "unclaimed" && stores.includes(o.storeId));

  // сводный лист сборки: сколько каждого товара собрать на рейс
  const pick = new Map<string, { name: string; sku: string; unit: string; qty: number }>();
  for (const o of confirmed)
    for (const it of o.items) {
      const q = it.confirmedQty ?? it.qty;
      if (!q) continue;
      const p = byId(db.products, it.productId);
      const cur = pick.get(it.productId) ?? { name: it.name, sku: p?.sku ?? "", unit: it.unit, qty: 0 };
      cur.qty += q;
      pick.set(it.productId, cur);
    }
  const pickList = [...pick.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  const trips = db.trips
    .filter((t) => t.distributorId === user.distributorId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);

  return (
    <>
      <PageHead
        title="Сборка и рейсы"
        sub="Заказы едут с обычной поставкой: собрали, промаркировали, отправили"
        actions={
          <button className="btn btn--sm no-print" onClick={() => window.print()}>
            <Printer size={15} /> Печать листа
          </button>
        }
      />

      <div className="pill-tabs no-print" style={{ marginBottom: 18 }}>
        {dates.length === 0 && <span className="muted small">Нет заказов к сборке</span>}
        {dates.map((d) => (
          <button key={d} aria-pressed={d === date} onClick={() => setDate(d)}>
            {fmtRelDay(d)} <span className="count">{open.filter((o) => o.deliveryDate === d).length}</span>
          </button>
        ))}
      </div>

      {placed.length > 0 && (
        <div className="notice no-print" style={{ marginBottom: 16 }}>
          <AlertTriangle size={18} />
          <span className="small">
            {pn(placed.length, ["заказ", "заказа", "заказов"])} на эту дату ещё не подтверждены —{" "}
            <Link href="/distributor/orders" className="link">
              подтвердить
            </Link>
            , иначе они не попадут в рейс.
          </span>
        </div>
      )}

      <div className={styles.cols}>
        <section className="stack">
          <h2 className="h2">Лист сборки · {date ? fmtRelDay(date) : "—"}</h2>
          {pickList.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Артикул</th>
                    <th>Товар</th>
                    <th className="r">Собрать</th>
                  </tr>
                </thead>
                <tbody>
                  {pickList.map((p) => (
                    <tr key={p.sku}>
                      <td className="mono small">{p.sku}</td>
                      <td className="small">{p.name}</td>
                      <td className="r mono">
                        <b>{p.qty}</b> {p.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">{assembled.length ? "Всё собрано — можно отправлять рейс." : "Нечего собирать."}</div>
          )}

          <h2 className="h2" style={{ marginTop: 10 }}>
            По магазинам
          </h2>
          {stores.map((sid) => {
            const s = byId(db.stores, sid)!;
            const list = work.filter((o) => o.storeId === sid);
            return (
              <div key={sid} className="card stack" style={{ ["--gap" as string]: "10px" }}>
                <div className="spread">
                  <b>
                    {s.name} <span className="muted small">· {s.address}</span>
                  </b>
                  <span className="small muted">{rub(list.reduce((a, o) => a + o.total - o.refund, 0))}</span>
                </div>
                {list.map((o) => (
                  <div key={o.id} className={styles.order}>
                    <span className="mono small">
                      <b>{o.label}</b>
                    </span>
                    <span className="grow small muted">
                      {byId(db.users, o.buyerId)?.name} · {pn(o.items.length, ["позиция", "позиции", "позиций"])}
                    </span>
                    {o.status === "confirmed" ? (
                      <button className="btn btn--sm no-print" disabled={!!pending} onClick={() => run("assembleOrders", [o.id])}>
                        <PackageCheck size={15} /> Собран
                      </button>
                    ) : (
                      <StatusChip status="assembled" />
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </section>

        <aside className="stack no-print">
          <div className={styles.dispatch}>
            <div className="row">
              <Truck size={20} />
              <b>Рейс {date ? fmtRelDay(date) : ""}</b>
            </div>
            <div className={styles.counts}>
              <div>
                <b>{confirmed.length}</b>
                <span>собрать</span>
              </div>
              <div>
                <b>{assembled.length}</b>
                <span>готово</span>
              </div>
              <div>
                <b>{stores.length}</b>
                <span>{["точка", "точки", "точек"][stores.length === 1 ? 0 : stores.length < 5 && stores.length > 1 ? 1 : 2]}</span>
              </div>
            </div>
            {confirmed.length > 0 && (
              <button className="btn btn--block" disabled={!!pending} onClick={() => run("assembleOrders", confirmed.map((o) => o.id))}>
                <PackageCheck size={16} /> Отметить все собранными
              </button>
            )}
            <Link
              href={`/distributor/labels?ids=${work.map((o) => o.id).join(",")}`}
              target="_blank"
              className="btn btn--block"
              aria-disabled={!work.length}
            >
              <Printer size={16} /> Печать маркировки ({work.length})
            </Link>
            <label className="field">
              <span>Водитель</span>
              <input className="input" value={driver} onChange={(e) => setDriver(e.target.value)} />
            </label>
            <label className="field">
              <span>Машина</span>
              <input className="input" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
            </label>
            {toReturn.length > 0 && (
              <div className="notice small">
                <AlertTriangle size={16} /> Забрать невыкуп: {toReturn.map((o) => `№${o.number}`).join(", ")}
              </div>
            )}
            <button
              className="btn btn--accent btn--lg btn--block"
              disabled={!assembled.length || !!pending}
              onClick={() => run("dispatchTrip", user.distributorId!, date, driver, vehicle)}
            >
              <Send size={17} /> Отправить рейс
            </button>
            <span className="tiny muted">Магазины и покупатели получат уведомление «в пути».</span>
          </div>

          <div className="stack" style={{ ["--gap" as string]: "8px" }}>
            <span className="kicker">Последние рейсы</span>
            {trips.map((t) => (
              <div key={t.id} className="card spread" style={{ ["--pad" as string]: "10px 14px" }}>
                <span className="stack" style={{ ["--gap" as string]: "1px" }}>
                  <b className="small">{fmtRelDay(t.date)}</b>
                  <span className="tiny muted">
                    {t.storeIds.map((s) => byId(db.stores, s)?.name).join(", ")}
                  </span>
                </span>
                <span className={`chip ${t.status === "on_road" ? "chip--mustard" : ""}`}>{t.status === "on_road" ? "в пути" : "завершён"}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}

export default function AssemblyPage() {
  return (
    <Suspense>
      <Assembly />
    </Suspense>
  );
}
