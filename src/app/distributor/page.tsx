"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Kpi, PageHead } from "@/components/cabinet/CabinetShell";
import { StatusChip } from "@/components/StatusChip";
import { byId } from "@/lib/engine";
import { addDays, fmtRelDay, today } from "@/lib/dates";
import { useApp } from "@/lib/data/provider";
import { percent, pn, rub } from "@/lib/format";
import { distOf, ordersOf } from "./lib";

export default function DistributorHome() {
  const { db, user } = useApp();
  const d = distOf(db, user);
  const orders = ordersOf(db, user);
  const T = today();
  const fresh = orders.filter((o) => o.status === "placed");
  const paid = orders.filter((o) => o.payment.paidAt && o.status !== "cancelled");
  const week = paid.filter((o) => o.createdAt.slice(0, 10) >= addDays(T, -7));
  const finished = orders.filter((o) => ["issued", "unclaimed", "returned"].includes(o.status));
  const unclaimedRate = finished.length ? finished.filter((o) => o.status !== "issued").length / finished.length : 0;
  const avg = paid.length ? paid.reduce((s, o) => s + o.total - o.refund, 0) / paid.length : 0;

  const upcoming = [...new Set(orders.filter((o) => ["placed", "confirmed", "assembled"].includes(o.status)).map((o) => o.deliveryDate))].sort();
  const toReturn = orders.filter((o) => o.status === "unclaimed");

  return (
    <>
      <PageHead title="Сводка" sub={`${d.name} · канал «Закупка» · ${fmtRelDay(T)}`} />

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 24 }}>
        <Link href="/distributor/orders">
          <Kpi label="ждут подтверждения" value={fresh.length} hint="подтвердить до 18:00 накануне" tone={fresh.length ? "mustard" : undefined} />
        </Link>
        <Kpi label="оплачено за 7 дней" value={rub(week.reduce((s, o) => s + o.total - o.refund, 0))} hint={pn(week.length, ["заказ", "заказа", "заказов"])} tone="green" />
        <Kpi label="средний чек" value={rub(Math.round(avg))} hint="после возвратов" />
        <Kpi label="невыкуп" value={percent(unclaimedRate, 1)} hint={`из ${finished.length} завершённых`} />
      </div>

      <div className="split">
        <section className="stack">
          <h2 className="h2">Ближайшие привозы</h2>
          {upcoming.length === 0 && <div className="empty">Новых заказов пока нет.</div>}
          {upcoming.map((date) => {
            const list = orders.filter((o) => o.deliveryDate === date && ["placed", "confirmed", "assembled"].includes(o.status));
            const stores = [...new Set(list.map((o) => o.storeId))];
            const c = (s: string) => list.filter((o) => o.status === s).length;
            return (
              <div key={date} className="card stack" style={{ ["--gap" as string]: "10px" }}>
                <div className="spread">
                  <b>{fmtRelDay(date)}</b>
                  <Link href={`/distributor/assembly?date=${date}`} className="link small row" style={{ ["--gap" as string]: "4px" }}>
                    Лист сборки <ArrowRight size={14} />
                  </Link>
                </div>
                <div className="row wrap" style={{ ["--gap" as string]: "6px" }}>
                  {c("placed") > 0 && <span className="chip chip--mustard">новых {c("placed")}</span>}
                  {c("confirmed") > 0 && <span className="chip chip--blue">к сборке {c("confirmed")}</span>}
                  {c("assembled") > 0 && <span className="chip chip--green">собрано {c("assembled")}</span>}
                </div>
                <span className="small muted">
                  {stores.map((s) => byId(db.stores, s)?.name).join(" · ")} — {rub(list.reduce((s, o) => s + o.total - o.refund, 0))}
                </span>
              </div>
            );
          })}
        </section>

        <section className="stack">
          <h2 className="h2">Требует внимания</h2>
          {toReturn.length > 0 && (
            <div className="notice">
              <AlertTriangle size={18} />
              <span className="small">
                Забрать невыкуп следующим рейсом:{" "}
                {toReturn.map((o) => (
                  <Link key={o.id} href={`/distributor/orders/${o.id}`} className="link">
                    №{o.number} ({byId(db.stores, o.storeId)?.name})
                  </Link>
                ))}
              </span>
            </div>
          )}
          {fresh.slice(0, 5).map((o) => (
            <Link key={o.id} href={`/distributor/orders/${o.id}`} className="card spread" style={{ ["--pad" as string]: "12px 14px" }}>
              <span className="stack" style={{ ["--gap" as string]: "2px" }}>
                <b className="small">
                  №{o.number} · {rub(o.total)}
                </b>
                <span className="tiny muted">
                  {byId(db.stores, o.storeId)?.name} · привоз {fmtRelDay(o.deliveryDate)}
                </span>
              </span>
              <StatusChip status={o.status} label="подтвердить" />
            </Link>
          ))}
          {fresh.length === 0 && toReturn.length === 0 && <div className="empty">Всё разобрано.</div>}
        </section>
      </div>
    </>
  );
}
