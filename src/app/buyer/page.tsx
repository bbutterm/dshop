"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MapPin, Search } from "lucide-react";
import { CodeDigits } from "@/components/Codes";
import { InstallBanner } from "@/components/InstallPrompt";
import { StatusChip } from "@/components/StatusChip";
import { byId, shelfSum } from "@/lib/engine";
import { fmtRelDay } from "@/lib/dates";
import { useApp } from "@/lib/data/provider";
import { pn, rub } from "@/lib/format";
import { availableProducts, buyerStore, savingPct, suppliersFor } from "./lib";
import { ProductGrid } from "./parts";
import styles from "./home.module.css";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

export default function BuyerHome() {
  const { db, user } = useApp();
  const router = useRouter();
  const store = buyerStore(db, user);

  if (!store) {
    return (
      <div className="stack fade-in" style={{ ["--gap" as string]: "16px", paddingTop: 24 }}>
        <h1 className="h1">Где вам удобно забирать заказы?</h1>
        <p className="muted">Выберите магазин у дома — покажем поставщиков, которые туда возят, и ближайшие даты привоза.</p>
        <Link href="/buyer/stores" className="btn btn--primary btn--lg">
          <MapPin size={18} /> Выбрать магазин
        </Link>
      </div>
    );
  }

  const mine = db.orders.filter((o) => o.buyerId === user.id);
  const waiting = mine.filter((o) => o.status === "at_store");
  const moving = mine.filter((o) => ["placed", "confirmed", "assembled", "in_transit"].includes(o.status));
  const done = mine.filter((o) => o.status === "issued");
  const saved = done.reduce((s, o) => s + Math.max(0, shelfSum(db, o.items) - o.total), 0);
  const suppliers = suppliersFor(db, store.id);
  const deals = availableProducts(db, store.id)
    .filter((p) => p.stock > 0)
    .sort((a, b) => (b.promo ? 1 : 0) - (a.promo ? 1 : 0) || savingPct(b) - savingPct(a))
    .slice(0, 6);

  return (
    <div className="stack fade-in" style={{ ["--gap" as string]: "22px" }}>
      <div className={styles.hello}>
        <div>
          <div className="muted small">{greeting()},</div>
          <div className="h1">{user.name.split(" ")[0]}</div>
        </div>
        {done.length > 0 && (
          <div className={styles.saved}>
            <span className="kicker">сэкономлено</span>
            <b>{rub(saved)}</b>
            <span className="tiny muted">за {pn(done.length, ["заказ", "заказа", "заказов"])}</span>
          </div>
        )}
      </div>

      {waiting.map((o) => (
        <Link key={o.id} href={`/buyer/orders/${o.id}`} className={styles.pickup}>
          <div className={styles.pickupTop}>
            <span className="kicker" style={{ color: "inherit", opacity: 0.75 }}>
              Заказ №{o.number} ждёт вас
            </span>
            <span className={styles.slot}>ячейка {o.shelfSlot}</span>
          </div>
          <CodeDigits code={o.pickupCode} big />
          <div className={styles.pickupFoot}>
            <span>
              {byId(db.stores, o.storeId)?.name} · до {o.storedUntil ? fmtRelDay(o.storedUntil) : "—"}
            </span>
            <span className="row" style={{ ["--gap" as string]: "4px" }}>
              Показать <ArrowRight size={15} />
            </span>
          </div>
        </Link>
      ))}

      {moving.length > 0 && (
        <div className="stack" style={{ ["--gap" as string]: "8px" }}>
          {moving.map((o) => (
            <Link key={o.id} href={`/buyer/orders/${o.id}`} className="card spread" style={{ ["--pad" as string]: "12px 14px" }}>
              <span className="stack" style={{ ["--gap" as string]: "2px" }}>
                <b className="small">
                  №{o.number} · {byId(db.distributors, o.distributorId)?.name}
                </b>
                <span className="tiny muted">
                  привоз {fmtRelDay(o.deliveryDate)} · {rub(o.total - o.refund)}
                </span>
              </span>
              <StatusChip status={o.status === "assembled" ? "confirmed" : o.status} />
            </Link>
          ))}
        </div>
      )}

      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q");
          router.push(`/buyer/catalog?q=${encodeURIComponent(String(q ?? ""))}`);
        }}
      >
        <Search size={18} />
        <input className="input" name="q" placeholder="Гречка, «Птичье молоко», кофе…" enterKeyHint="search" />
      </form>

      <section className="stack">
        <div className="section-title">
          <h2 className="h2">Возят в {store.name}</h2>
          <Link href="/buyer/stores" className="link small">
            другой магазин
          </Link>
        </div>
        {suppliers.length === 0 && <div className="empty">Сюда пока никто не возит. Выберите другой магазин.</div>}
        {suppliers.map(({ distributor: d, route, dates, count }) => (
          <Link key={d.id} href={`/buyer/supplier/${d.id}`} className={styles.supplier} style={{ ["--c" as string]: d.color }}>
            <div className={styles.supTop}>
              <div className="stack" style={{ ["--gap" as string]: "4px" }}>
                <b className={styles.supName}>{d.name}</b>
                <span className="small muted">{d.about}</span>
              </div>
              <ArrowRight size={20} />
            </div>
            <div className={styles.supDates}>
              {dates.map((dt, i) => (
                <span key={dt} className={i === 0 ? styles.dateFirst : styles.date}>
                  {fmtRelDay(dt)}
                </span>
              ))}
            </div>
            <div className="tiny muted">
              {pn(count, ["товар", "товара", "товаров"])} · минимальный заказ {rub(route.minOrder)} · заказ до {route.cutoffHour}:00 накануне
            </div>
          </Link>
        ))}
      </section>

      <section className="stack">
        <div className="section-title">
          <h2 className="h2">Выгоднее всего на неделе</h2>
          <Link href="/buyer/catalog" className="link small">
            весь каталог
          </Link>
        </div>
        <ProductGrid products={deals} />
      </section>

      <InstallBanner />

      {done.length === 0 && (
        <section className={styles.how}>
          <div className="kicker">Как это работает</div>
          <ol>
            <li>Собираете корзину у поставщика — по его цене, без наценки магазина.</li>
            <li>Платите онлайн, чек приходит от поставщика.</li>
            <li>Заказ едет с обычной поставкой в {store.name}. Забираете по коду.</li>
          </ol>
        </section>
      )}
    </div>
  );
}
