"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Info, Trash2 } from "lucide-react";
import { ProductArt } from "@/components/ProductArt";
import { fmtRelDay } from "@/lib/dates";
import { useAction, useApp } from "@/lib/data/provider";
import { rub } from "@/lib/format";
import { buyerStore, cartBlocks } from "../lib";
import { Stepper } from "../parts";
import styles from "./cart.module.css";

export default function CartPage() {
  const { db, user } = useApp();
  const { run } = useAction();
  const store = buyerStore(db, user);
  const blocks = cartBlocks(db, user);
  const [dates, setDates] = useState<Record<string, string>>({});

  if (!blocks.length) {
    return (
      <div className="stack fade-in" style={{ ["--gap" as string]: "16px" }}>
        <h1 className="h1">Корзина</h1>
        <div className="empty">
          <span>Корзина пуста. Загляните к поставщикам — у каждого своя корзина и своя дата привоза.</span>
          <Link href="/buyer/catalog" className="btn btn--primary">
            В каталог
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack fade-in" style={{ ["--gap" as string]: "18px" }}>
      <div className="stack" style={{ ["--gap" as string]: "4px" }}>
        <h1 className="h1">Корзина</h1>
        <p className="small muted">
          Один поставщик — один заказ и одна дата привоза в {store?.name}.
        </p>
      </div>

      {blocks.map((b) => {
        const date = dates[b.distributor.id] ?? b.dates[0];
        const min = b.route?.minOrder ?? 0;
        const ok = b.total >= min;
        return (
          <section key={b.distributor.id} className="receipt" style={{ ["--c" as string]: b.distributor.color }}>
            <div className={styles.head}>
              <span className={styles.sw} />
              <b className="grow">{b.distributor.name}</b>
              <button
                className="btn btn--ghost btn--sm btn--icon"
                aria-label="Очистить корзину поставщика"
                onClick={() => b.lines.forEach((l) => run("cartSet", user.id, store!.id, l.productId, 0))}
              >
                <Trash2 size={16} />
              </button>
            </div>

            {!b.route && (
              <div className="notice notice--tomato" style={{ marginBottom: 12 }}>
                <Info size={16} /> Не возит в выбранный магазин — смените магазин или удалите товары.
              </div>
            )}

            <div className={styles.lines}>
              {b.lines.map((l) => (
                <div key={l.productId} className={styles.line}>
                  <ProductArt product={l.product} size={52} />
                  <div className="grow stack" style={{ ["--gap" as string]: "2px" }}>
                    <span className={styles.lname}>{l.product.name}</span>
                    <span className="tiny muted">
                      {rub(l.product.price)} / {l.product.unit} · {l.product.weight}
                    </span>
                  </div>
                  <div className="stack" style={{ ["--gap" as string]: "6px", alignItems: "flex-end" }}>
                    <b className="small num nowrap">{rub(l.qty * l.product.price)}</b>
                    <Stepper product={l.product} light />
                  </div>
                </div>
              ))}
            </div>

            <hr className="hr-dash" style={{ margin: "14px 0" }} />

            {b.dates.length > 0 && (
              <div className="stack" style={{ ["--gap" as string]: "8px", marginBottom: 14 }}>
                <span className="kicker">Дата привоза</span>
                <div className="pill-tabs">
                  {b.dates.map((d) => (
                    <button key={d} aria-pressed={d === date} onClick={() => setDates((s) => ({ ...s, [b.distributor.id]: d }))}>
                      {fmtRelDay(d)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="stack" style={{ ["--gap" as string]: "6px" }}>
              <div className="receipt-line small muted">
                <span>На полке магазина</span>
                <span className="dots" />
                <s className="num">{rub(b.shelf)}</s>
              </div>
              <div className="receipt-line small" style={{ color: "var(--green)" }}>
                <span>Ваша экономия</span>
                <span className="dots" />
                <b className="num">−{rub(b.shelf - b.total)}</b>
              </div>
              <div className="receipt-line">
                <b>Итого</b>
                <span className="dots" />
                <b className={styles.total}>{rub(b.total)}</b>
              </div>
            </div>

            {b.route && !ok && (
              <div className={styles.min}>
                <div className="progress">
                  <i style={{ width: `${(b.total / min) * 100}%`, background: "var(--mustard)" }} />
                </div>
                <span className="small">
                  Минимальный заказ у поставщика {rub(min)} — добавьте ещё на {rub(min - b.total)}.{" "}
                  <Link href={`/buyer/supplier/${b.distributor.id}`} className="link">
                    К товарам
                  </Link>
                </span>
              </div>
            )}

            <Link
              href={`/buyer/checkout/${b.distributor.id}?date=${date ?? ""}`}
              className="btn btn--primary btn--block btn--lg"
              aria-disabled={!ok || !b.route || !date}
              style={{ marginTop: 16 }}
            >
              Оформить к {date ? fmtRelDay(date) : "—"} <ArrowRight size={18} />
            </Link>
          </section>
        );
      })}
    </div>
  );
}
