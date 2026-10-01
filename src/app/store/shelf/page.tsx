"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { byId } from "@/lib/engine";
import { diffDays, fmtRelDay, today } from "@/lib/dates";
import { useAction, useApp } from "@/lib/data/provider";
import { phoneFmt, pn } from "@/lib/format";
import type { Order } from "@/lib/types";
import styles from "./shelf.module.css";

export default function ShelfPage() {
  const { db, user } = useApp();
  const { run, pending } = useAction();
  const store = byId(db.stores, user.storeId)!;
  const [open, setOpen] = useState<string | null>(null);
  const onShelf = db.orders
    .filter((o) => o.storeId === store.id && o.status === "at_store")
    .sort((a, b) => (a.storedUntil ?? "").localeCompare(b.storedUntil ?? ""));
  const unclaimed = db.orders.filter((o) => o.storeId === store.id && o.status === "unclaimed");
  const bySlot = new Map([...onShelf, ...unclaimed].map((o) => [o.shelfSlot, o]));
  const T = today();
  const slots = Array.from({ length: store.capacity }).map((_, i) => {
    const row = "АБВГДЕЖ"[Math.floor(i / 8)];
    return `${row}-${String((i % 8) + 1).padStart(2, "0")}`;
  });
  const o = open ? byId(db.orders, open) : undefined;
  const state = (x: Order) => (x.status === "unclaimed" ? "back" : (x.storedUntil ?? "9") < T ? "late" : x.storedUntil === T ? "today" : "ok");

  return (
    <div className="stack fade-in" style={{ ["--gap" as string]: "20px" }}>
      <div className="spread" style={{ alignItems: "flex-end" }}>
        <div className="stack" style={{ ["--gap" as string]: "4px" }}>
          <h1 className="h1">Полка выдачи</h1>
          <span className="small muted">
            Занято {onShelf.length + unclaimed.length} из {store.capacity} мест · хранение {pn(store.storageDays, ["день", "дня", "дней"])}
          </span>
        </div>
        <div className={styles.legend}>
          <span data-s="ok">ждёт</span>
          <span data-s="today">последний день</span>
          <span data-s="late">срок истёк</span>
          <span data-s="back">вернуть поставщику</span>
        </div>
      </div>

      <div className={styles.rack}>
        {slots.map((s) => {
          const x = bySlot.get(s);
          return (
            <button key={s} className={styles.slot} data-s={x ? state(x) : "free"} disabled={!x} onClick={() => x && setOpen(x.id)}>
              <span className="mono tiny">{s}</span>
              {x && <b>№{x.number}</b>}
            </button>
          );
        })}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Ячейка</th>
              <th>Заказ</th>
              <th>Покупатель</th>
              <th>Поставщик</th>
              <th>Хранится до</th>
            </tr>
          </thead>
          <tbody>
            {[...onShelf, ...unclaimed].map((x) => {
              const st = state(x);
              return (
                <tr key={x.id} className="clickable" onClick={() => setOpen(x.id)}>
                  <td className="mono">{x.shelfSlot}</td>
                  <td>№{x.number}</td>
                  <td>{byId(db.users, x.buyerId)?.name}</td>
                  <td className="muted">{byId(db.distributors, x.distributorId)?.name}</td>
                  <td>
                    {st === "back" ? (
                      <span className="chip chip--tomato">невыкуп</span>
                    ) : st === "late" ? (
                      <span className="chip chip--tomato">истёк {fmtRelDay(x.storedUntil!)}</span>
                    ) : st === "today" ? (
                      <span className="chip chip--mustard">сегодня</span>
                    ) : (
                      fmtRelDay(x.storedUntil!)
                    )}
                  </td>
                </tr>
              );
            })}
            {onShelf.length + unclaimed.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 28 }}>
                  Полка пуста
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {o && (
        <Sheet
          open
          onClose={() => setOpen(null)}
          title={`Ячейка ${o.shelfSlot} · №${o.number}`}
          footer={
            o.status === "at_store" ? (
              <div className="row">
                <button className="btn grow" disabled={!!pending} onClick={() => run("extendStorage", o.id, 1)}>
                  Продлить на день
                </button>
                <button
                  className="btn btn--danger grow"
                  disabled={!!pending}
                  onClick={async () => {
                    await run("markUnclaimed", o.id);
                    setOpen(null);
                  }}
                >
                  Отметить невыкуп
                </button>
              </div>
            ) : (
              <span className="small muted">Пакет отдадите водителю {byId(db.distributors, o.distributorId)?.name} со следующей поставкой.</span>
            )
          }
        >
          <div className="stack">
            <div className="stack" style={{ ["--gap" as string]: "2px" }}>
              <b>{byId(db.users, o.buyerId)?.name}</b>
              <span className="mono small muted">{phoneFmt(byId(db.users, o.buyerId)?.phone ?? "")}</span>
            </div>
            {o.status === "at_store" && o.storedUntil && (
              <div className={`notice ${o.storedUntil < T ? "notice--tomato" : ""}`}>
                {o.storedUntil < T
                  ? `Срок хранения истёк ${pn(-diffDays(o.storedUntil, T), ["день", "дня", "дней"])} назад. Позвоните покупателю или отметьте невыкуп.`
                  : `Хранится до ${fmtRelDay(o.storedUntil)}.`}
              </div>
            )}
            <ul className="stack small" style={{ ["--gap" as string]: "6px", listStyle: "none" }}>
              {o.items.map((it) => (
                <li key={it.productId} className="spread">
                  <span>{it.name}</span>
                  <b className="mono">
                    {it.receivedQty ?? it.qty} {it.unit}
                  </b>
                </li>
              ))}
            </ul>
          </div>
        </Sheet>
      )}
    </div>
  );
}
