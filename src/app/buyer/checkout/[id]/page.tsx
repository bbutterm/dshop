"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowLeft, Clock, CreditCard, MapPin, ReceiptText } from "lucide-react";
import { byId } from "@/lib/engine";
import { fmtRelDay } from "@/lib/dates";
import { useAction, useApp } from "@/lib/data/provider";
import { phoneFmt, pn, rub } from "@/lib/format";
import { buyerStore, cartBlocks } from "../../lib";

function Checkout() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { db, user } = useApp();
  const { run, pending } = useAction();
  const store = buyerStore(db, user);
  const block = cartBlocks(db, user).find((b) => b.distributor.id === id);
  const [date, setDate] = useState(params.get("date") || block?.dates[0] || "");
  const [agree, setAgree] = useState(true);

  if (!block || !store || !block.route) {
    return (
      <div className="empty">
        Корзина этого поставщика пуста.
        <Link href="/buyer/cart" className="btn btn--sm">
          В корзину
        </Link>
      </div>
    );
  }
  const d = block.distributor;
  const count = block.lines.reduce((s, l) => s + l.qty, 0);

  return (
    <div className="stack fade-in" style={{ ["--gap" as string]: "16px" }}>
      <Link href="/buyer/cart" className="row small muted" style={{ ["--gap" as string]: "6px" }}>
        <ArrowLeft size={16} /> Корзина
      </Link>
      <h1 className="h1">Оформление</h1>

      <section className="card stack" style={{ ["--gap" as string]: "10px" }}>
        <span className="kicker">Где забрать</span>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <MapPin size={18} style={{ marginTop: 2, color: "var(--green)" }} />
          <div className="stack" style={{ ["--gap" as string]: "2px" }}>
            <b>{store.name}</b>
            <span className="small muted">
              {store.address}, {store.hours}
            </span>
          </div>
        </div>
        <div className="row small muted" style={{ ["--gap" as string]: "8px" }}>
          <Clock size={16} /> Заказ хранится {pn(store.storageDays, ["день", "дня", "дней"])} после привоза
        </div>
      </section>

      <section className="card stack" style={{ ["--gap" as string]: "10px" }}>
        <span className="kicker">Когда привезти</span>
        <div className="pill-tabs">
          {block.dates.map((dt) => (
            <button key={dt} aria-pressed={dt === date} onClick={() => setDate(dt)}>
              {fmtRelDay(dt)}
            </button>
          ))}
        </div>
        <span className="tiny muted">
          Едет с обычной поставкой {d.name}. Заказы на ближайший привоз принимаются до {block.route.cutoffHour}:00 накануне.
        </span>
      </section>

      <section className="receipt stack" style={{ ["--gap" as string]: "8px" }}>
        <div className="spread">
          <span className="kicker">Состав · {pn(count, ["единица", "единицы", "единиц"])}</span>
          <Link href="/buyer/cart" className="link small">
            изменить
          </Link>
        </div>
        {block.lines.map((l) => (
          <div key={l.productId} className="receipt-line small">
            <span className="ellipsis" style={{ maxWidth: "60%" }}>
              {l.product.name}
            </span>
            <span className="muted nowrap">× {l.qty}</span>
            <span className="dots" />
            <span className="num nowrap">{rub(l.qty * l.product.price)}</span>
          </div>
        ))}
        <hr className="hr-dash" style={{ margin: "6px 0" }} />
        <div className="receipt-line small" style={{ color: "var(--green)" }}>
          <span>Экономия против полки</span>
          <span className="dots" />
          <b>−{rub(block.shelf - block.total)}</b>
        </div>
        <div className="receipt-line">
          <b>К оплате</b>
          <span className="dots" />
          <b className="display" style={{ fontSize: 22, fontWeight: 600 }}>
            {rub(block.total)}
          </b>
        </div>
      </section>

      <section className="card stack" style={{ ["--gap" as string]: "10px" }}>
        <span className="kicker">Оплата</span>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <CreditCard size={18} style={{ marginTop: 2 }} />
          <span className="small">
            Картой по ссылке <b>{d.name}</b> — деньги идут напрямую поставщику, не нам и не магазину.
          </span>
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <ReceiptText size={18} style={{ marginTop: 2 }} />
          <span className="small">Чек от облачной кассы поставщика придёт в СМС на {phoneFmt(user.phone)}.</span>
        </div>
        <label className="check small">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          Если не заберу заказ за {pn(store.storageDays, ["день", "дня", "дней"])}, он вернётся поставщику
        </label>
      </section>

      <button
        className="btn btn--primary btn--lg btn--block"
        disabled={!agree || !date || !!pending}
        onClick={async () => {
          const o = await run("placeOrder", user.id, d.id, date);
          if (o) router.push(`/buyer/pay/${o.id}`);
        }}
      >
        {pending ? "Создаём заказ…" : `Перейти к оплате · ${rub(block.total)}`}
      </button>
      <p className="tiny muted" style={{ textAlign: "center" }}>
        Платёжная страница — заглушка эквайринга поставщика
      </p>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense>
      <Checkout />
    </Suspense>
  );
}
