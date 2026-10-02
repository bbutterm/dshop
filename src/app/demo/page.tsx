"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowUpRight, Check, RotateCcw } from "lucide-react";
import { CodeDigits } from "@/components/Codes";
import { Logo } from "@/components/Logo";
import { Loading } from "@/components/RoleGate";
import { StatusChip } from "@/components/StatusChip";
import { byId, payLink, receiptLink } from "@/lib/engine";
import { fmtRelDay } from "@/lib/dates";
import { useData } from "@/lib/data/provider";
import { rub } from "@/lib/format";
import { DEMO } from "@/lib/seed";
import type { Order, OrderStatus } from "@/lib/types";
import styles from "./demo.module.css";

const ORDER: OrderStatus[] = ["awaiting_payment", "placed", "confirmed", "assembled", "in_transit", "at_store", "issued"];
const reached = (o: Order | undefined, s: OrderStatus) => !!o && ORDER.indexOf(o.status) >= ORDER.indexOf(s);
const as = (userId: string, next: string) => `/login?as=${userId}&next=${encodeURIComponent(next)}`;

/** Сценарий показа: один заказ проходит все роли. Прогресс обновляется вживую из соседних вкладок */
export default function DemoScript() {
  const ctx = useData();
  // с базой данных страница смотрит на заказы глазами платформы — входим как админ
  const needAdmin = ctx?.backend === "supabase" && !!ctx.db && ctx.user?.role !== "admin";
  const asked = useRef(false);
  useEffect(() => {
    if (needAdmin && !asked.current) {
      asked.current = true;
      void ctx?.login("u-admin");
    }
  }, [needAdmin, ctx]);
  if (!ctx?.db || needAdmin) return <Loading />;
  const db = ctx.db;
  const buyerId = ctx.idOf(DEMO.buyer);
  // заказ сценария — последний, созданный Анной в приложении (у демо-заказов id вида «o-1043»)
  const o = db.orders.find((x) => x.buyerId === buyerId && !x.id.startsWith("o-") && x.status !== "cancelled");

  const steps: { who: string; title: string; text: React.ReactNode; done: boolean; href?: string; cta: string }[] = [
    {
      who: "Покупатель",
      title: "Оформить заказ",
      text: "Корзина «Деснапродукта» уже собрана. Выберите дату привоза и нажмите «Перейти к оплате».",
      done: !!o,
      href: as(DEMO.buyer, "/buyer/cart"),
      cta: "Открыть корзину",
    },
    {
      who: "Покупатель",
      title: "Оплатить по ссылке из СМС",
      text: "Откроется страница эквайринга дистрибьютора (заглушка). Карта …0004 — успех, …0002 — отказ банка.",
      done: reached(o, "placed"),
      href: o ? payLink(o.id) : undefined,
      cta: "Ссылка на оплату",
    },
    {
      who: "Дистрибьютор",
      title: "Подтвердить по позициям",
      text: "Можно уменьшить количество — покупателю посчитается возврат и придёт уведомление.",
      done: reached(o, "confirmed"),
      href: as(DEMO.distributor, o ? `/distributor/orders/${o.id}` : "/distributor/orders"),
      cta: "Кабинет дистрибьютора",
    },
    {
      who: "Дистрибьютор",
      title: "Собрать и отправить рейс",
      text: "«Отметить все собранными», при желании распечатать маркировку, затем «Отправить рейс».",
      done: reached(o, "in_transit"),
      href: as(DEMO.distributor, o ? `/distributor/assembly?date=${o.deliveryDate}` : "/distributor/assembly"),
      cta: "Сборка и рейсы",
    },
    {
      who: "Магазин",
      title: "Принять поставку",
      text: o ? <>Скан маркировки <b className="mono">{o.label}</b> или «Принять все». Покупатель получит код.</> : "Скан маркировки или «Принять все». Покупатель получит код.",
      done: reached(o, "at_store"),
      href: as(DEMO.store, "/store/incoming"),
      cta: "Приёмка",
    },
    {
      who: "Магазин",
      title: "Выдать по коду",
      text: o && o.status === "at_store" ? <>Код покупателя: <CodeDigits code={o.pickupCode} /></> : "Продавец вводит 6-значный код с экрана покупателя.",
      done: reached(o, "issued"),
      href: as(DEMO.store, "/store"),
      cta: "Выдача",
    },
    {
      who: "Покупатель",
      title: "Заказ выдан, чек и экономия",
      text: "У покупателя — штамп «Выдан» и экономия против полки, у дистрибьютора и магазина — строки в отчётах.",
      done: o?.status === "issued",
      href: o?.payment.paidAt ? receiptLink(o.id) : undefined,
      cta: "Электронный чек",
    },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <main className={styles.page}>
      <header className="spread">
        <Link href="/">
          <Logo size={26} />
        </Link>
        <button
          className="btn btn--sm"
          onClick={async () => {
            await ctx.source.reset();
            ctx.toast({ title: "Демо-данные сброшены", body: "Можно начинать сценарий заново.", tone: "info" });
          }}
        >
          <RotateCcw size={14} /> Начать заново
        </button>
      </header>

      <div className="stack" style={{ ["--gap" as string]: "6px" }}>
        <span className="kicker">Сценарий показа · 7 шагов · ~3 минуты</span>
        <h1 className="h1">Один заказ через все роли</h1>
        <p className="small muted">
          Откройте шаги в новых вкладках — у каждой вкладки своя роль. Эта страница отмечает пройденное сама. Оплата, СМС и чек — заглушки со
          ссылками, как в рабочей версии.
        </p>
      </div>

      {o && (
        <div className={styles.order}>
          <span className="grow">
            <b>Заказ №{o.number}</b>
            <span className="small muted">
              {" "}
              · {rub(o.total)} · привоз {fmtRelDay(o.deliveryDate)} · {byId(db.stores, o.storeId)?.name}
            </span>
          </span>
          <StatusChip status={o.status} />
        </div>
      )}

      <ol className={styles.steps}>
        {steps.map((s, i) => (
          <li key={s.title} data-state={s.done ? "done" : i === current ? "now" : "next"}>
            <span className={styles.num}>{s.done ? <Check size={16} strokeWidth={3} /> : i + 1}</span>
            <div className="grow stack" style={{ ["--gap" as string]: "4px", minWidth: 0 }}>
              <span className="kicker">{s.who}</span>
              <b>{s.title}</b>
              <span className="small muted">{s.text}</span>
            </div>
            {s.href && (
              <a className={`btn btn--sm ${i === current ? "btn--primary" : ""}`} href={s.href} target="_blank" rel="noreferrer">
                {s.cta} <ArrowUpRight size={14} />
              </a>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
