"use client";

import { Kpi, PageHead } from "@/components/cabinet/CabinetShell";
import { fmtDay } from "@/lib/dates";
import { useApp } from "@/lib/data/provider";
import { percent, rub } from "@/lib/format";
import { pilotMetrics } from "./metrics";
import styles from "./admin.module.css";

export default function AdminHome() {
  const { db } = useApp();
  const m = pilotMetrics(db);
  const max = Math.max(1, ...m.weeks.map((w) => w.n));
  const flow = [
    ["оформлен", db.orders.filter((o) => o.status === "placed").length],
    ["подтверждён", db.orders.filter((o) => o.status === "confirmed" || o.status === "assembled").length],
    ["в пути", db.orders.filter((o) => o.status === "in_transit").length],
    ["в магазине", db.orders.filter((o) => o.status === "at_store").length],
    ["выдан", db.orders.filter((o) => o.status === "issued").length],
    ["невыкуп", db.orders.filter((o) => o.status === "unclaimed" || o.status === "returned").length],
  ] as const;

  return (
    <>
      <PageHead title="Пилот" sub="Брянск · 1 дистрибьютор в фокусе, 3 магазина · цель — проверить привычку, а не заработать" />

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: 20 }}>
        <Kpi label="заказов в неделю" value={m.avgPerWeek.toFixed(1).replace(".", ",")} hint="среднее за 4 недели — хватит ли спроса на точку" tone="green" />
        <Kpi label="средний чек" value={rub(Math.round(m.avgCheck))} hint="какую минималку ставить" />
        <Kpi label="повторные покупатели" value={percent(m.repeatShare)} hint={`из ${m.buyers} — становится ли привычкой`} />
        <Kpi label="невыкуп" value={percent(m.unclaimedShare, 1)} hint="хватает ли предоплаты" />
        <Kpi label="время до выдачи" value={`${m.pickupHours.toFixed(0)} ч`} hint="от приёмки до выдачи" />
        <Kpi label="дешевле полки" value={percent(m.shelfGap)} hint="главное обещание" tone="mustard" />
      </div>

      <div className="split">
        <section className="card stack">
          <div className="spread">
            <b>Заказы по неделям</b>
            <span className="small muted">оборот канала {rub(m.gmv)}</span>
          </div>
          <div className={styles.chart}>
            {m.weeks.map((w, i) => (
              <div key={w.from} className={styles.col}>
                <span className="mono tiny">{w.n}</span>
                <i style={{ height: `${(w.n / max) * 100}%` }} data-last={i === m.weeks.length - 1} />
                <span className="tiny muted">{fmtDay(w.from).replace(/ (\S{3})\S*/, " $1")}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card stack">
          <b>Где сейчас заказы</b>
          <div className="stack" style={{ ["--gap" as string]: "8px" }}>
            {flow.map(([k, n]) => (
              <div key={k} className="spread small">
                <span className="grow">{k}</span>
                <span className="progress" style={{ width: "45%" }}>
                  <i style={{ width: `${Math.min(100, (n / Math.max(1, ...flow.map((f) => f[1]))) * 100)}%`, background: k === "невыкуп" ? "var(--tomato)" : undefined }} />
                </span>
                <b className="mono" style={{ width: 28, textAlign: "right" }}>
                  {n}
                </b>
              </div>
            ))}
          </div>
          <hr className="hr" />
          <div className="small muted">
            Комиссия платформы на пилоте — 0. После пилота: процент с оборота канала у дистрибьютора (при 3 % сейчас было бы {rub(Math.round(m.gmv * 0.03))}).
          </div>
        </section>
      </div>
    </>
  );
}
