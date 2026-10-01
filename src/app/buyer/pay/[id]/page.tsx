"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Check, Copy, ExternalLink, MessageSquareText, Share2 } from "lucide-react";
import { byId, payLink } from "@/lib/engine";
import { useApp } from "@/lib/data/provider";
import { phoneFmt, rub } from "@/lib/format";
import styles from "./pay.module.css";

const noop = () => () => {};

/** После оформления: ссылка на оплату «пришла в СМС» — её можно открыть, скопировать или переслать */
export default function PayLinkSent() {
  const { id } = useParams<{ id: string }>();
  const { db, user, toast } = useApp();
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const canShare = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);
  const o = byId(db.orders, id);
  if (!o || o.buyerId !== user.id) return <div className="empty">Заказ не найден</div>;
  const d = byId(db.distributors, o.distributorId)!;
  const url = `${origin}${payLink(o.id)}`;

  if (o.status !== "awaiting_payment") {
    return (
      <div className="empty">
        {o.status === "cancelled" ? "Заказ отменён." : "Заказ уже оплачен."}
        <Link href={`/buyer/orders/${o.id}`} className="btn btn--sm">
          К заказу
        </Link>
      </div>
    );
  }

  return (
    <div className="stack fade-in" style={{ ["--gap" as string]: "18px" }}>
      <div className="stack" style={{ ["--gap" as string]: "4px" }}>
        <span className="kicker">Заказ №{o.number} создан</span>
        <h1 className="h1">Осталось оплатить</h1>
        <p className="small muted">
          Платёж идёт напрямую {d.name}. Ссылку на оплату отправили в СМС на {phoneFmt(user.phone)}.
        </p>
      </div>

      <div className={styles.phone}>
        <div className={styles.from}>
          <MessageSquareText size={14} /> СМС · {d.short === "DP" ? "DESNA-OPT" : "BAKALEYA32"}
        </div>
        <div className={styles.bubble}>
          {d.name}: заказ №{o.number} на {rub(o.total)}. Оплатите по ссылке:{" "}
          <Link href={payLink(o.id)} className={styles.url}>
            {url.replace(/^https?:\/\//, "")}
          </Link>
          <span className={styles.time}>сейчас</span>
        </div>
      </div>

      <Link href={payLink(o.id)} className="btn btn--accent btn--lg btn--block">
        <ExternalLink size={18} /> Открыть ссылку и оплатить {rub(o.total)}
      </Link>
      <div className="row">
        <button
          className="btn grow"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              toast({ title: "Не удалось скопировать", body: url, tone: "warn" });
            }
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Скопировано" : "Скопировать"}
        </button>
        {canShare && (
          <button
            className="btn grow"
            onClick={() => navigator.share({ title: `Оплата заказа №${o.number}`, text: `Оплатите ${rub(o.total)}`, url }).catch(() => {})}
          >
            <Share2 size={16} /> Переслать
          </button>
        )}
      </div>
      <p className="tiny muted" style={{ textAlign: "center" }}>
        Ссылку можно отправить тому, кто платит в семье. В демо она работает в этом браузере; с базой данных — на любом устройстве.
      </p>
    </div>
  );
}
