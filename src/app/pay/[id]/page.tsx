"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, ReceiptText } from "lucide-react";
import { Loading } from "@/components/RoleGate";
import { byId, receiptLink } from "@/lib/engine";
import { useAction, useData } from "@/lib/data/provider";
import { pn, rub } from "@/lib/format";
import styles from "./pay.module.css";

/**
 * Платёжная страница по ссылке — заглушка интернет-эквайринга дистрибьютора.
 * Открывается из СМС без входа в приложение, как настоящая ссылка банка.
 */
export default function PayLinkPage() {
  const { id } = useParams<{ id: string }>();
  const ctx = useData();
  const { run } = useAction();
  const router = useRouter();
  const [stage, setStage] = useState<"form" | "processing" | "declined">("form");
  const [card, setCard] = useState("2200 0000 0000 0004");
  if (!ctx?.db) return <Loading />;
  const o = byId(ctx.db.orders, id);
  if (!o) {
    return (
      <main className={styles.page}>
        <div className={styles.gate}>
          <div className={styles.body}>
            <b>Ссылка недействительна</b>
            <p className="small muted">Заказ не найден. В демо данные хранятся в этом браузере — откройте ссылку там же, где оформляли заказ.</p>
          </div>
        </div>
      </main>
    );
  }
  const d = byId(ctx.db.distributors, o.distributorId)!;
  const isBuyer = ctx.user?.id === o.buyerId;
  const units = o.items.reduce((s, it) => s + it.qty, 0);
  const declineCard = card.replace(/\s/g, "").endsWith("0002");

  const pay = async () => {
    setStage("processing");
    await new Promise((r) => setTimeout(r, 1100));
    if (declineCard) {
      setStage("declined");
      return;
    }
    const res = await run("payOrder", o.id);
    if (!res) return setStage("form");
    if (isBuyer) router.replace(`/buyer/orders/${o.id}?paid=1`);
    else setStage("form");
  };

  return (
    <main className={styles.page}>
      <div className={styles.test}>Тестовый режим · деньги не списываются</div>
      <div className={styles.gate}>
        <div className={styles.head}>
          <span className="row" style={{ ["--gap" as string]: "8px" }}>
            <Lock size={14} /> <b>Pay·Demo</b>
          </span>
          <span className="tiny" style={{ opacity: 0.7 }}>
            эквайринг поставщика
          </span>
        </div>

        <div className={styles.body}>
          <div className="stack" style={{ ["--gap" as string]: "2px" }}>
            <span className="tiny muted">Получатель</span>
            <b>{d.name}</b>
            <span className="tiny muted">
              ИНН {d.inn} · заказ №{o.number} · {pn(units, ["товар", "товара", "товаров"])}
            </span>
          </div>
          <div className={styles.amount}>{rub(o.total)}</div>

          {o.status !== "awaiting_payment" ? (
            <div className="stack" style={{ ["--gap" as string]: "12px" }}>
              {o.status === "cancelled" ? (
                <div className="notice notice--tomato">Заказ отменён, оплата не требуется.</div>
              ) : (
                <div className="notice notice--green">
                  <CheckCircle2 size={18} /> Оплачено. Чек {o.payment.receiptNo} отправлен в СМС.
                </div>
              )}
              {o.payment.paidAt && (
                <Link href={receiptLink(o.id)} className="btn btn--block">
                  <ReceiptText size={16} /> Открыть электронный чек
                </Link>
              )}
              <Link href={isBuyer ? `/buyer/orders/${o.id}` : "/app"} className="btn btn--primary btn--block">
                Вернуться в «Закупку»
              </Link>
            </div>
          ) : (
            <>
              <div className="stack" style={{ ["--gap" as string]: "10px" }}>
                <label className="field">
                  <span>Номер карты</span>
                  <input className="input mono" inputMode="numeric" autoComplete="cc-number" value={card} onChange={(e) => setCard(e.target.value)} />
                </label>
                <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <label className="field">
                    <span>Срок</span>
                    <input className="input mono" inputMode="numeric" defaultValue="12/28" />
                  </label>
                  <label className="field">
                    <span>CVC</span>
                    <input className="input mono" inputMode="numeric" defaultValue="123" type="password" />
                  </label>
                </div>
                <span className="tiny muted">
                  Тестовые карты: …0004 — успешная оплата, …0002 — банк отклонит.
                </span>
              </div>

              {stage === "declined" && (
                <div className="notice notice--tomato">
                  <AlertTriangle size={18} /> Банк отклонил операцию (тестовая карта …0002). Попробуйте другую карту.
                </div>
              )}

              <button className="btn btn--accent btn--lg btn--block" disabled={stage === "processing"} onClick={pay}>
                {stage === "processing" ? "Проводим платёж…" : `Оплатить ${rub(o.total)}`}
              </button>
              <button
                className="btn btn--ghost btn--block"
                disabled={stage === "processing"}
                onClick={async () => {
                  await run("cancelOrder", o.id, "buyer");
                  if (isBuyer) router.replace("/buyer/cart");
                }}
              >
                Отказаться от оплаты
              </button>
            </>
          )}
        </div>
      </div>
      <p className={styles.note}>
        В рабочей версии эту страницу показывает банк-эквайер дистрибьютора, а чек формирует его облачная касса.
      </p>
    </main>
  );
}
