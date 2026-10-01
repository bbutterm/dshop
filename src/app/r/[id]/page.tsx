"use client";

import { useParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { QR } from "@/components/Codes";
import { Loading } from "@/components/RoleGate";
import { byId, receiptLink } from "@/lib/engine";
import { useData } from "@/lib/data/provider";
import { rub } from "@/lib/format";
import styles from "./receipt.module.css";

const noop = () => () => {};

/** Электронный чек по ссылке — заглушка чека облачной кассы дистрибьютора */
export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const ctx = useData();
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  if (!ctx?.db) return <Loading />;
  const o = byId(ctx.db.orders, id);
  if (!o || !o.payment.paidAt) return <main className={styles.page}><div className={styles.slip}>Чек не найден</div></main>;
  const d = byId(ctx.db.distributors, o.distributorId)!;
  const paid = new Date(o.payment.paidAt);
  const fn = `73800${d.inn.slice(-5)}${o.number}`;

  return (
    <main className={styles.page}>
      <div className={styles.demo}>Демо · не является фискальным документом</div>
      <article className={styles.slip}>
        <header className={styles.center}>
          <b>{d.name}</b>
          <span>ИНН {d.inn}</span>
          <span>Интернет-магазин · zakupka.demo</span>
        </header>
        <div className={styles.center} style={{ margin: "10px 0" }}>
          <b>КАССОВЫЙ ЧЕК · ПРИХОД</b>
          <span>
            {paid.toLocaleDateString("ru-RU")} {paid.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <hr />
        {o.items.map((it, i) => (
          <div key={it.productId} className={styles.item}>
            <span>
              {i + 1}. {it.name}
            </span>
            <span className={styles.line}>
              <span>
                {it.qty} × {rub(it.price)}
              </span>
              <span>{rub(it.qty * it.price)}</span>
            </span>
            <span className={styles.sub}>Предоплата 100 % · товар</span>
          </div>
        ))}
        <hr />
        <div className={styles.total}>
          <span>ИТОГ</span>
          <span>{rub(o.total)}</span>
        </div>
        <div className={styles.line}>
          <span>Безналичными</span>
          <span>{rub(o.total)}</span>
        </div>
        <hr />
        <div className={styles.meta}>
          <span>Чек № {o.payment.receiptNo}</span>
          <span>ФН {fn}</span>
          <span>Заказ №{o.number} · выдача в магазине у дома</span>
        </div>
        <div className={styles.qr}>
          <QR value={`${origin}${receiptLink(o.id)}`} size={120} />
        </div>
      </article>
      <button className="btn btn--sm" onClick={() => window.print()}>
        Сохранить или распечатать
      </button>
    </main>
  );
}
