"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";
import { byId } from "@/lib/engine";
import { useAction, useApp } from "@/lib/data/provider";
import { rub } from "@/lib/format";
import styles from "./pay.module.css";

export default function PayPage() {
  const { id } = useParams<{ id: string }>();
  const { db } = useApp();
  const { run } = useAction();
  const router = useRouter();
  const [stage, setStage] = useState<"form" | "processing">("form");
  const o = byId(db.orders, id);
  if (!o) return <div className="empty">Заказ не найден</div>;
  const d = byId(db.distributors, o.distributorId)!;

  if (o.status !== "awaiting_payment" && stage === "form") {
    return (
      <div className="empty">
        Заказ уже оплачен.
        <Link href={`/buyer/orders/${o.id}`} className="btn btn--sm">
          К заказу
        </Link>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ paddingTop: 8 }}>
      <div className={styles.gate}>
        <div className={styles.gateHead}>
          <span className="kicker" style={{ color: "inherit" }}>
            <Lock size={11} style={{ display: "inline", verticalAlign: -1 }} /> Тестовая платёжная страница
          </span>
          <span className="tiny" style={{ opacity: 0.7 }}>заглушка эквайринга</span>
        </div>
        <div className={styles.merchant}>
          <span className="small muted">Получатель</span>
          <b>{d.name}</b>
          <span className="tiny muted">ИНН {d.inn} · заказ №{o.number}</span>
        </div>
        <div className={styles.amount}>{rub(o.total)}</div>

        <div className="stack" style={{ ["--gap" as string]: "10px" }}>
          <label className="field">
            <span>Номер карты</span>
            <input className="input mono" defaultValue="2200 0000 0000 0004" inputMode="numeric" />
          </label>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label className="field">
              <span>Срок</span>
              <input className="input mono" defaultValue="12/28" />
            </label>
            <label className="field">
              <span>CVC</span>
              <input className="input mono" defaultValue="•••" />
            </label>
          </div>
        </div>

        <button
          className="btn btn--accent btn--lg btn--block"
          disabled={stage === "processing"}
          onClick={async () => {
            setStage("processing");
            await new Promise((r) => setTimeout(r, 900));
            const res = await run("payOrder", o.id);
            if (res) router.replace(`/buyer/orders/${o.id}?paid=1`);
            else setStage("form");
          }}
        >
          {stage === "processing" ? "Проводим платёж…" : `Оплатить ${rub(o.total)}`}
        </button>
        <button
          className="btn btn--ghost btn--block"
          disabled={stage === "processing"}
          onClick={async () => {
            await run("cancelOrder", o.id, "buyer");
            router.replace("/buyer/cart");
          }}
        >
          Отказаться от оплаты
        </button>
      </div>
      <p className="tiny muted" style={{ textAlign: "center", marginTop: 14 }}>
        В рабочей версии здесь будет страница банка-эквайера поставщика, а чек — от его облачной кассы.
      </p>
    </div>
  );
}
