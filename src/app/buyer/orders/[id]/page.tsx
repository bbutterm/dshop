"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock, MapPin, MessageSquareWarning, RotateCcw } from "lucide-react";
import { CodeDigits, QR } from "@/components/Codes";
import { Sheet } from "@/components/Sheet";
import { StatusChip } from "@/components/StatusChip";
import { BUYER_STEPS, byId, receiptLink, shelfSum, stepIndex } from "@/lib/engine";
import { fmtDateTime, fmtRelDay } from "@/lib/dates";
import { useAction, useApp } from "@/lib/data/provider";
import { rub } from "@/lib/format";
import styles from "./order.module.css";

function OrderView() {
  const { id } = useParams<{ id: string }>();
  const paid = useSearchParams().get("paid");
  const router = useRouter();
  const { db, user } = useApp();
  const { run, pending } = useAction();
  const [dispute, setDispute] = useState(false);
  const [text, setText] = useState("");
  const o = byId(db.orders, id);
  if (!o || o.buyerId !== user.id) return <div className="empty">Заказ не найден</div>;
  const d = byId(db.distributors, o.distributorId)!;
  const s = byId(db.stores, o.storeId)!;
  const step = stepIndex(o.status);
  const finalTotal = o.total - o.refund;
  const saved = Math.max(0, shelfSum(db, o.items) - o.total);
  const off = ["cancelled", "unclaimed", "returned"].includes(o.status);

  const stepTime = (k: string) => o.history.find((h) => h.status === k)?.at;

  return (
    <div className="stack fade-in" style={{ ["--gap" as string]: "16px" }}>
      <Link href="/buyer/orders" className="back">
        <ArrowLeft size={16} /> Заказы
      </Link>

      {paid && o.status === "placed" && (
        <div className="notice notice--green fade-in">
          <CheckCircle2 size={18} />
          <span>
            <b>Оплачено.</b> Чек от {d.name} отправлен в СМС. Поставщик подтвердит заказ — мы сообщим.
          </span>
        </div>
      )}

      <div className="spread" style={{ alignItems: "flex-start" }}>
        <div className="stack" style={{ ["--gap" as string]: "4px" }}>
          <h1 className="h1">Заказ №{o.number}</h1>
          <span className="small muted">
            {d.name} · {fmtDateTime(o.createdAt)}
          </span>
        </div>
        <StatusChip status={o.status === "assembled" ? "confirmed" : o.status} />
      </div>

      {o.status === "at_store" && (
        <section className={styles.code}>
          <div className={styles.codeTop}>
            <div className="stack" style={{ ["--gap" as string]: "4px" }}>
              <span className="kicker" style={{ color: "inherit", opacity: 0.7 }}>
                Код выдачи
              </span>
              <CodeDigits code={o.pickupCode} big />
              <span className="small" style={{ opacity: 0.85 }}>
                Назовите код или покажите QR продавцу
              </span>
            </div>
            <div className={styles.qr}>
              <QR value={o.pickupCode} size={112} />
            </div>
          </div>
          <div className={styles.codeFoot}>
            <span>
              <MapPin size={14} /> {s.name}, {s.address}
            </span>
            <span>
              <Clock size={14} /> {s.hours} · до {o.storedUntil ? fmtRelDay(o.storedUntil) : "—"}
            </span>
            <span className={styles.slot}>ячейка {o.shelfSlot}</span>
          </div>
        </section>
      )}

      {o.status === "issued" && (
        <div className={styles.issued}>
          <span className="stamp" style={{ color: "var(--green)" }}>
            Выдан
          </span>
          <div className="stack" style={{ ["--gap" as string]: "2px" }}>
            <b>Заказ получен {fmtDateTime(stepTime("issued") ?? o.updatedAt)}</b>
            <span className="small muted">Экономия против полки — {rub(saved)}</span>
          </div>
        </div>
      )}

      {o.status === "awaiting_payment" && (
        <Link href={`/buyer/pay/${o.id}`} className="notice" style={{ alignItems: "center" }}>
          <span className="grow">Заказ ждёт оплаты по ссылке из СМС.</span>
          <span className="btn btn--sm btn--accent">Оплатить</span>
        </Link>
      )}

      {off && (
        <div className="notice notice--tomato">
          <span>
            {o.status === "cancelled" && `Заказ отменён. ${o.refund ? `Возврат ${rub(o.refund)} — на карту в течение 1–3 дней.` : ""}`}
            {o.status === "unclaimed" && "Заказ не забрали вовремя — он вернётся поставщику ближайшим рейсом."}
            {o.status === "returned" && "Заказ вернулся поставщику."}
          </span>
        </div>
      )}

      {!off && (
        <section className="card">
          <ol className={styles.steps}>
            {BUYER_STEPS.map((st, i) => {
              const t = i === 1 ? stepTime("confirmed") : stepTime(st.key);
              return (
                <li key={st.key} data-state={i < step ? "done" : i === step ? "now" : "next"}>
                  <span className={styles.dot} />
                  <span className="grow">
                    <b>{st.label}</b>
                    {i === 2 && step < 2 && <span className="tiny muted"> · ожидается {fmtRelDay(o.deliveryDate)}</span>}
                  </span>
                  <span className="tiny muted">{t ? fmtDateTime(t) : ""}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="receipt stack" style={{ ["--gap" as string]: "8px" }}>
        <span className="kicker">Состав</span>
        {o.items.map((it) => {
          const got = it.receivedQty ?? it.confirmedQty;
          const short = got !== undefined && got < it.qty;
          return (
            <div key={it.productId} className="stack" style={{ ["--gap" as string]: "2px" }}>
              <div className="receipt-line small">
                <span className="ellipsis" style={{ maxWidth: "62%" }}>
                  {it.name}
                </span>
                <span className="muted nowrap">
                  {short ? (
                    <>
                      <s>{it.qty}</s> {got}
                    </>
                  ) : (
                    it.qty
                  )}{" "}
                  {it.unit}
                </span>
                <span className="dots" />
                <span className="num nowrap">{rub((got ?? it.qty) * it.price)}</span>
              </div>
              {short && <span className="tiny" style={{ color: "var(--tomato)" }}>не хватило {it.qty - got!} — деньги вернём</span>}
            </div>
          );
        })}
        <hr className="hr-dash" style={{ margin: "6px 0" }} />
        <div className="receipt-line small muted">
          <span>Оплачено</span>
          <span className="dots" />
          <span className="num">{rub(o.total)}</span>
        </div>
        {o.refund > 0 && (
          <div className="receipt-line small" style={{ color: "var(--tomato)" }}>
            <span>Возврат на карту</span>
            <span className="dots" />
            <span className="num">−{rub(o.refund)}</span>
          </div>
        )}
        <div className="receipt-line">
          <b>Итого</b>
          <span className="dots" />
          <b className="display" style={{ fontSize: 20, fontWeight: 600 }}>
            {rub(finalTotal)}
          </b>
        </div>
        {o.payment.paidAt && (
          <Link href={receiptLink(o.id)} className="tiny mono link" style={{ alignSelf: "flex-start" }}>
            электронный чек {o.payment.receiptNo} · продавец {d.name}
          </Link>
        )}
      </section>

      <div className="stack" style={{ ["--gap" as string]: "8px" }}>
        {o.status === "placed" && (
          <button
            className="btn btn--danger btn--block"
            disabled={!!pending}
            onClick={() => run("cancelOrder", o.id, "buyer")}
          >
            Отменить заказ и вернуть деньги
          </button>
        )}
        {(o.status === "issued" || o.status === "returned" || o.status === "cancelled") && (
          <button
            className="btn btn--block"
            onClick={async () => {
              const store = user.favoriteStoreId ?? o.storeId;
              for (const it of o.items) await run("cartSet", user.id, store, it.productId, it.qty);
              router.push("/buyer/cart");
            }}
          >
            <RotateCcw size={16} /> Повторить заказ
          </button>
        )}
        {o.status === "issued" && !o.dispute && (
          <button className="btn btn--ghost btn--block" onClick={() => setDispute(true)}>
            <MessageSquareWarning size={16} /> Проблема с заказом
          </button>
        )}
        {o.dispute && (
          <div className="notice notice--blue">
            <MessageSquareWarning size={16} />
            <span className="small">
              Обращение: «{o.dispute.text}» — {o.dispute.resolved ? "рассмотрено" : "поддержка разбирается"}
            </span>
          </div>
        )}
      </div>

      <details className={styles.history}>
        <summary>История заказа</summary>
        <ul>
          {o.history.map((h, i) => (
            <li key={i}>
              <span className="tiny muted mono">{fmtDateTime(h.at)}</span>
              <span className="small">{h.text}</span>
            </li>
          ))}
        </ul>
      </details>

      <Sheet
        open={dispute}
        onClose={() => setDispute(false)}
        title="Что случилось?"
        footer={
          <button
            className="btn btn--primary btn--block"
            disabled={text.trim().length < 5}
            onClick={async () => {
              await run("openDispute", o.id, text.trim());
              setDispute(false);
            }}
          >
            Отправить в поддержку
          </button>
        }
      >
        <div className="stack">
          <div className="pill-tabs" style={{ flexWrap: "wrap" }}>
            {["Не хватает товара", "Помята упаковка", "Истёк срок годности", "Не тот товар"].map((t) => (
              <button key={t} onClick={() => setText(t)} aria-pressed={text === t}>
                {t}
              </button>
            ))}
          </div>
          <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Опишите, что не так" />
          <span className="tiny muted">Поддержка платформы разберётся с поставщиком и магазином.</span>
        </div>
      </Sheet>
    </div>
  );
}

export default function OrderPage() {
  return (
    <Suspense>
      <OrderView />
    </Suspense>
  );
}
