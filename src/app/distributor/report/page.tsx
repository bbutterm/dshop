"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Kpi, PageHead } from "@/components/cabinet/CabinetShell";
import { byId } from "@/lib/engine";
import { addDays, today } from "@/lib/dates";
import { useApp } from "@/lib/data/provider";
import { percent, rub } from "@/lib/format";
import { ordersOf } from "../lib";

const PERIODS = [
  { k: 7, label: "7 дней" },
  { k: 30, label: "30 дней" },
  { k: 90, label: "Квартал" },
];

export default function DistReport() {
  const { db, user } = useApp();
  const [days, setDays] = useState(30);
  const from = addDays(today(), -days);
  const orders = ordersOf(db, user).filter((o) => o.deliveryDate >= from && o.payment.paidAt);
  const storeIds = [...new Set(orders.map((o) => o.storeId))];
  const rows = storeIds.map((sid) => {
    const s = byId(db.stores, sid)!;
    const list = orders.filter((o) => o.storeId === sid);
    const issued = list.filter((o) => o.status === "issued");
    const unclaimed = list.filter((o) => o.status === "unclaimed" || o.status === "returned");
    const paid = list.filter((o) => o.status !== "cancelled").reduce((a, o) => a + o.total - o.refund, 0);
    return { s, n: list.length, issued: issued.length, unclaimed: unclaimed.length, paid, fee: issued.length * s.pickupFee };
  });
  const tot = rows.reduce((a, r) => ({ n: a.n + r.n, issued: a.issued + r.issued, unclaimed: a.unclaimed + r.unclaimed, paid: a.paid + r.paid, fee: a.fee + r.fee }), { n: 0, issued: 0, unclaimed: 0, paid: 0, fee: 0 });

  const csv = () => {
    const head = "Магазин;Заказов;Выдано;Невыкуп;Оплачено, ₽;Плата магазину, ₽";
    const body = rows.map((r) => [r.s.name, r.n, r.issued, r.unclaimed, r.paid, r.fee].join(";"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + [head, ...body].join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `отчёт-${today()}.csv`;
    a.click();
  };

  return (
    <>
      <PageHead
        title="Отчёт"
        sub="Заказы, оплаты и выдачи по магазинам — основа расчёта с точками за выдачу"
        actions={
          <>
            <div className="pill-tabs">
              {PERIODS.map((p) => (
                <button key={p.k} aria-pressed={days === p.k} onClick={() => setDays(p.k)}>
                  {p.label}
                </button>
              ))}
            </div>
            <button className="btn btn--sm" onClick={csv}>
              <Download size={15} /> CSV
            </button>
          </>
        }
      />
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <Kpi label="оборот канала" value={rub(tot.paid)} tone="green" />
        <Kpi label="заказов" value={tot.n} />
        <Kpi label="невыкуп" value={percent(tot.issued + tot.unclaimed ? tot.unclaimed / (tot.issued + tot.unclaimed) : 0, 1)} />
        <Kpi label="к оплате магазинам" value={rub(tot.fee)} tone="mustard" />
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Магазин</th>
              <th className="r">Заказов</th>
              <th className="r">Выдано</th>
              <th className="r">Невыкуп</th>
              <th className="r">Оплачено</th>
              <th className="r">Плата за выдачу</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.s.id}>
                <td>
                  <b>{r.s.name}</b>
                  <div className="tiny muted">{rub(r.s.pickupFee)} за заказ</div>
                </td>
                <td className="r mono">{r.n}</td>
                <td className="r mono">{r.issued}</td>
                <td className="r mono">{r.unclaimed}</td>
                <td className="r mono">{rub(r.paid)}</td>
                <td className="r mono">
                  <b>{rub(r.fee)}</b>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <b>Итого</b>
              </td>
              <td className="r mono">{tot.n}</td>
              <td className="r mono">{tot.issued}</td>
              <td className="r mono">{tot.unclaimed}</td>
              <td className="r mono">{rub(tot.paid)}</td>
              <td className="r mono">
                <b>{rub(tot.fee)}</b>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
