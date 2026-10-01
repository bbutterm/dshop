"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, Minus, Plus, Printer, Undo2, X } from "lucide-react";
import { PageHead } from "@/components/cabinet/CabinetShell";
import { Barcode } from "@/components/Codes";
import { Sheet } from "@/components/Sheet";
import { StatusChip } from "@/components/StatusChip";
import { byId } from "@/lib/engine";
import { fmtDateTime, fmtRelDay } from "@/lib/dates";
import { useAction, useApp } from "@/lib/data/provider";
import { phoneFmt, rub } from "@/lib/format";

export default function DistOrder() {
  const { id } = useParams<{ id: string }>();
  const { db, user } = useApp();
  const { run, pending } = useAction();
  const o = byId(db.orders, id);
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries((o?.items ?? []).map((it) => [it.productId, it.qty])),
  );
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState("");
  if (!o || o.distributorId !== user.distributorId) return <div className="empty">Заказ не найден</div>;

  const store = byId(db.stores, o.storeId)!;
  const buyer = byId(db.users, o.buyerId);
  const editing = o.status === "placed";
  const confirmedSum = o.items.reduce((s, it) => s + (editing ? (qty[it.productId] ?? it.qty) : (it.receivedQty ?? it.confirmedQty ?? it.qty)) * it.price, 0);
  const diff = o.total - confirmedSum;

  return (
    <>
      <Link href="/distributor/orders" className="row small muted" style={{ ["--gap" as string]: "6px", marginBottom: 12 }}>
        <ArrowLeft size={16} /> Заказы
      </Link>
      <PageHead
        title={`Заказ №${o.number}`}
        sub={
          <span className="row wrap" style={{ ["--gap" as string]: "8px" }}>
            <StatusChip status={o.status} /> оформлен {fmtDateTime(o.createdAt)}
          </span>
        }
        actions={
          ["confirmed", "assembled", "in_transit"].includes(o.status) ? (
            <Link href={`/distributor/labels?ids=${o.id}`} target="_blank" className="btn btn--sm">
              <Printer size={15} /> Маркировка
            </Link>
          ) : null
        }
      />

      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(260px, 1fr)", gap: 20, alignItems: "start" }}>
        <section className="stack">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th className="r">Цена</th>
                  <th className="r">Заказано</th>
                  <th className="r">{editing ? "Подтверждаю" : "Подтверждено"}</th>
                  <th className="r">Остаток</th>
                </tr>
              </thead>
              <tbody>
                {o.items.map((it) => {
                  const p = byId(db.products, it.productId);
                  const q = qty[it.productId] ?? it.qty;
                  return (
                    <tr key={it.productId}>
                      <td>
                        <b className="small">{it.name}</b>
                        <div className="tiny muted mono">{p?.sku}</div>
                      </td>
                      <td className="r mono nowrap">{rub(it.price)}</td>
                      <td className="r mono">
                        {it.qty} {it.unit}
                      </td>
                      <td className="r">
                        {editing ? (
                          <div className="qty qty--light" style={{ height: 34 }}>
                            <button style={{ height: 34, width: 32 }} onClick={() => setQty((s) => ({ ...s, [it.productId]: Math.max(0, q - 1) }))} aria-label="Меньше">
                              <Minus size={14} />
                            </button>
                            <span style={{ color: q < it.qty ? "var(--tomato)" : undefined }}>{q}</span>
                            <button style={{ height: 34, width: 32 }} onClick={() => setQty((s) => ({ ...s, [it.productId]: Math.min(it.qty, q + 1) }))} aria-label="Больше">
                              <Plus size={14} />
                            </button>
                          </div>
                        ) : (
                          <span className="mono" style={{ color: (it.confirmedQty ?? it.qty) < it.qty ? "var(--tomato)" : undefined }}>
                            {it.confirmedQty ?? "—"}
                            {it.receivedQty !== undefined && it.receivedQty < (it.confirmedQty ?? it.qty) ? ` → ${it.receivedQty}` : ""}
                          </span>
                        )}
                      </td>
                      <td className="r mono muted">{p?.stock ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card stack" style={{ ["--gap" as string]: "6px" }}>
            <div className="receipt-line small muted">
              <span>Оплачено покупателем</span>
              <span className="dots" />
              <span className="mono">{rub(o.total)}</span>
            </div>
            {diff > 0 && (
              <div className="receipt-line small" style={{ color: "var(--tomato)" }}>
                <span>Вернуть покупателю</span>
                <span className="dots" />
                <span className="mono">−{rub(diff)}</span>
              </div>
            )}
            <div className="receipt-line">
              <b>Итог по заказу</b>
              <span className="dots" />
              <b className="mono">{rub(confirmedSum)}</b>
            </div>
          </div>

          {editing && (
            <div className="row wrap">
              <button className="btn btn--primary btn--lg" disabled={!!pending} onClick={() => run("confirmOrder", o.id, qty)}>
                <Check size={18} /> {diff > 0 ? "Подтвердить частично" : "Подтвердить заказ"}
              </button>
              <button className="btn btn--danger btn--lg" onClick={() => setReject(true)}>
                <X size={18} /> Отклонить
              </button>
            </div>
          )}
          {o.status === "unclaimed" && (
            <button className="btn btn--lg" disabled={!!pending} onClick={() => run("returnUnclaimed", o.id)}>
              <Undo2 size={18} /> Невыкуп забран, вернуть на склад
            </button>
          )}
        </section>

        <aside className="stack">
          <div className="card stack" style={{ ["--gap" as string]: "10px" }}>
            <span className="kicker">Доставка</span>
            <b>{store.name}</b>
            <span className="small muted">
              {store.address} · {store.hours}
            </span>
            <span className="small">
              Привоз <b>{fmtRelDay(o.deliveryDate)}</b>
              {o.shelfSlot && o.status === "at_store" ? ` · ячейка ${o.shelfSlot}` : ""}
            </span>
          </div>
          <div className="card stack" style={{ ["--gap" as string]: "6px" }}>
            <span className="kicker">Покупатель</span>
            <b>{buyer?.name}</b>
            <span className="small mono muted">{phoneFmt(buyer?.phone ?? "")}</span>
            <span className="tiny muted">
              Оплата по ссылке {o.payment.paidAt ? `· ${fmtDateTime(o.payment.paidAt)}` : ""} · {o.payment.receiptNo}
            </span>
          </div>
          <div className="card stack" style={{ ["--gap" as string]: "8px", alignItems: "center" }}>
            <span className="kicker" style={{ alignSelf: "flex-start" }}>
              Маркировка
            </span>
            <Barcode value={o.label} width={220} height={50} />
            <b className="mono">{o.label}</b>
          </div>
          <details className="card">
            <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>
              История
            </summary>
            <ul className="stack" style={{ ["--gap" as string]: "8px", listStyle: "none", marginTop: 10 }}>
              {o.history.map((h, i) => (
                <li key={i} className="stack" style={{ ["--gap" as string]: "0" }}>
                  <span className="tiny muted mono">{fmtDateTime(h.at)}</span>
                  <span className="small">{h.text}</span>
                </li>
              ))}
            </ul>
          </details>
        </aside>
      </div>

      <Sheet
        open={reject}
        onClose={() => setReject(false)}
        title="Отклонить заказ"
        footer={
          <button
            className="btn btn--danger btn--block"
            onClick={async () => {
              await run("cancelOrder", o.id, "distributor", reason || "Поставщик не сможет привезти заказ");
              setReject(false);
            }}
          >
            Отклонить и вернуть {rub(o.total)}
          </button>
        }
      >
        <div className="stack">
          <span className="small muted">Покупатель получит уведомление, деньги вернутся на карту.</span>
          <div className="pill-tabs" style={{ flexWrap: "wrap" }}>
            {["Нет машины на эту дату", "Товара нет на складе", "Магазин закрыт на приёмку"].map((t) => (
              <button key={t} aria-pressed={reason === t} onClick={() => setReason(t)}>
                {t}
              </button>
            ))}
          </div>
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина" />
        </div>
      </Sheet>
    </>
  );
}
