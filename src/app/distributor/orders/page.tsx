"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHead } from "@/components/cabinet/CabinetShell";
import { StatusChip } from "@/components/StatusChip";
import { byId } from "@/lib/engine";
import { fmtDateTime, fmtRelDay } from "@/lib/dates";
import { useApp } from "@/lib/data/provider";
import { rub } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";
import { ordersOf } from "../lib";

const TABS: { key: string; label: string; st: OrderStatus[] }[] = [
  { key: "new", label: "Новые", st: ["placed"] },
  { key: "work", label: "В работе", st: ["confirmed", "assembled"] },
  { key: "road", label: "В пути", st: ["in_transit"] },
  { key: "store", label: "В магазинах", st: ["at_store", "unclaimed"] },
  { key: "done", label: "Завершённые", st: ["issued", "returned", "cancelled"] },
];

export default function DistOrders() {
  const { db, user } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState("new");
  const [store, setStore] = useState("");
  const all = ordersOf(db, user).filter((o) => o.status !== "awaiting_payment");
  const cur = TABS.find((t) => t.key === tab)!;
  const list = all.filter((o) => cur.st.includes(o.status) && (!store || o.storeId === store));
  const stores = [...new Set(all.map((o) => o.storeId))];

  return (
    <>
      <PageHead title="Заказы" sub="Один заказ — один покупатель, один магазин, одна дата привоза" />
      <div className="spread wrap" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <div className="pill-tabs">
          {TABS.map((t) => (
            <button key={t.key} aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label} <span className="count">{all.filter((o) => t.st.includes(o.status)).length}</span>
            </button>
          ))}
        </div>
        <select className="select" style={{ width: "auto", minHeight: 36 }} value={store} onChange={(e) => setStore(e.target.value)}>
          <option value="">Все магазины</option>
          {stores.map((s) => (
            <option key={s} value={s}>
              {byId(db.stores, s)?.name}
            </option>
          ))}
        </select>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>№</th>
              <th>Оформлен</th>
              <th>Магазин</th>
              <th>Привоз</th>
              <th className="r">Позиций</th>
              <th className="r">Сумма</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => (
              <tr key={o.id} className="clickable" onClick={() => router.push(`/distributor/orders/${o.id}`)}>
                <td className="mono">
                  <b>{o.number}</b>
                </td>
                <td className="muted small nowrap">{fmtDateTime(o.createdAt)}</td>
                <td>{byId(db.stores, o.storeId)?.name}</td>
                <td className="nowrap">{fmtRelDay(o.deliveryDate)}</td>
                <td className="r mono">{o.items.length}</td>
                <td className="r mono nowrap">{rub(o.total - o.refund)}</td>
                <td>
                  <StatusChip status={o.status} />
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 32 }}>
                  Здесь пусто
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
