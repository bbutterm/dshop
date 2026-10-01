"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { PageHead } from "@/components/cabinet/CabinetShell";
import { Sheet } from "@/components/Sheet";
import { StatusChip } from "@/components/StatusChip";
import { byId } from "@/lib/engine";
import { fmtDateTime, fmtRelDay } from "@/lib/dates";
import { useAction, useApp } from "@/lib/data/provider";
import { rub } from "@/lib/format";

function Orders() {
  const { db } = useApp();
  const { run } = useAction();
  const [open, setOpen] = useState<string | null>(useSearchParams().get("open"));
  const [answer, setAnswer] = useState("");
  const [q, setQ] = useState("");
  const disputes = db.orders.filter((o) => o.dispute);
  const list = db.orders.filter((o) => o.status !== "awaiting_payment" && (!q || o.number.includes(q) || byId(db.users, o.buyerId)?.name.toLowerCase().includes(q.toLowerCase())));
  const o = open ? byId(db.orders, open) : undefined;

  return (
    <>
      <PageHead title="Заказы и споры" sub="Все заказы платформы. Деньги идут напрямую дистрибьюторам — здесь только наблюдение и разбор обращений." />

      {disputes.length > 0 && (
        <section className="stack" style={{ marginBottom: 24 }}>
          <h2 className="h2">Обращения</h2>
          {disputes.map((d) => (
            <button key={d.id} className="card spread" onClick={() => setOpen(d.id)} style={{ ["--pad" as string]: "12px 16px" }}>
              <span className="row" style={{ alignItems: "flex-start" }}>
                <MessageSquareWarning size={18} style={{ marginTop: 2, color: d.dispute!.resolved ? "var(--faint)" : "var(--tomato)" }} />
                <span className="stack" style={{ ["--gap" as string]: "2px" }}>
                  <b className="small">
                    №{d.number} · {byId(db.users, d.buyerId)?.name} · {byId(db.distributors, d.distributorId)?.name}
                  </b>
                  <span className="small muted">«{d.dispute!.text}»</span>
                </span>
              </span>
              <span className={`chip ${d.dispute!.resolved ? "" : "chip--tomato"}`}>{d.dispute!.resolved ? "решено" : "открыто"}</span>
            </button>
          ))}
        </section>
      )}

      <input className="input" style={{ maxWidth: 320, marginBottom: 12 }} placeholder="Номер или покупатель" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="table-wrap">
        <table className="table table--cards">
          <thead>
            <tr>
              <th>№</th>
              <th>Покупатель</th>
              <th>Дистрибьютор</th>
              <th>Магазин</th>
              <th>Привоз</th>
              <th className="r">Сумма</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 80).map((x) => (
              <tr key={x.id} className="clickable" onClick={() => setOpen(x.id)}>
                <td className="mono card-title">
                  <b>№{x.number}</b>
                </td>
                <td className="small" data-label="покупатель">{byId(db.users, x.buyerId)?.name}</td>
                <td className="small" data-label="поставщик">{byId(db.distributors, x.distributorId)?.name}</td>
                <td className="small" data-label="магазин">{byId(db.stores, x.storeId)?.name}</td>
                <td className="small nowrap" data-label="привоз">{fmtRelDay(x.deliveryDate)}</td>
                <td className="r mono nowrap" data-label="сумма">{rub(x.total - x.refund)}</td>
                <td className="card-end">
                  <StatusChip status={x.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {o && (
        <Sheet
          open
          wide
          onClose={() => setOpen(null)}
          title={`Заказ №${o.number}`}
          footer={
            o.dispute && !o.dispute.resolved ? (
              <div className="stack" style={{ ["--gap" as string]: "8px" }}>
                <div className="pill-tabs" style={{ flexWrap: "wrap" }}>
                  {["Поставщик даст скидку 10 % на следующий заказ", "Вернём стоимость позиции на карту", "Магазин заменит товар при следующем привозе"].map((t) => (
                    <button key={t} aria-pressed={answer === t} onClick={() => setAnswer(t)}>
                      {t}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <input className="input grow" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Ответ покупателю" />
                  <button
                    className="btn btn--primary"
                    disabled={!answer.trim()}
                    onClick={async () => {
                      await run("resolveDispute", o.id, answer.trim());
                      setAnswer("");
                    }}
                  >
                    Закрыть спор
                  </button>
                </div>
              </div>
            ) : undefined
          }
        >
          <div className="stack">
            <div className="row wrap">
              <StatusChip status={o.status} />
              <span className="small muted">
                {byId(db.users, o.buyerId)?.name} → {byId(db.distributors, o.distributorId)?.name} → {byId(db.stores, o.storeId)?.name}
              </span>
            </div>
            {o.dispute && <div className="notice notice--tomato small">Обращение: «{o.dispute.text}»</div>}
            <ul className="stack" style={{ ["--gap" as string]: "8px", listStyle: "none" }}>
              {o.history.map((h, i) => (
                <li key={i} className="row" style={{ alignItems: "baseline" }}>
                  <span className="tiny muted mono" style={{ width: 150, flex: "none" }}>
                    {fmtDateTime(h.at)}
                  </span>
                  <span className="small">{h.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </Sheet>
      )}
    </>
  );
}

export default function AdminOrders() {
  return (
    <Suspense>
      <Orders />
    </Suspense>
  );
}
