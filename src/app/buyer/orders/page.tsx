"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { StatusChip } from "@/components/StatusChip";
import { ACTIVE_STATUSES, byId } from "@/lib/engine";
import { fmtRelDay } from "@/lib/dates";
import { useApp } from "@/lib/data/provider";
import { pn, rub } from "@/lib/format";

export default function OrdersPage() {
  const { db, user } = useApp();
  const [tab, setTab] = useState<"active" | "archive">("active");
  const mine = db.orders.filter((o) => o.buyerId === user.id);
  const active = mine.filter((o) => ACTIVE_STATUSES.includes(o.status) || o.status === "awaiting_payment");
  const archive = mine.filter((o) => !active.includes(o));
  const list = tab === "active" ? active : archive;

  return (
    <div className="stack fade-in" style={{ ["--gap" as string]: "16px" }}>
      <h1 className="h1">Мои заказы</h1>
      <div className="pill-tabs">
        <button aria-pressed={tab === "active"} onClick={() => setTab("active")}>
          Текущие <span className="count">{active.length}</span>
        </button>
        <button aria-pressed={tab === "archive"} onClick={() => setTab("archive")}>
          История <span className="count">{archive.length}</span>
        </button>
      </div>
      {list.length === 0 && (
        <div className="empty">
          {tab === "active" ? "Нет текущих заказов." : "Здесь появятся полученные заказы."}
          {tab === "active" && (
            <Link href="/buyer/catalog" className="btn btn--sm">
              В каталог
            </Link>
          )}
        </div>
      )}
      <div className="stack" style={{ ["--gap" as string]: "10px" }}>
        {list.map((o) => {
          const d = byId(db.distributors, o.distributorId)!;
          const s = byId(db.stores, o.storeId)!;
          return (
            <Link
              key={o.id}
              href={o.status === "awaiting_payment" ? `/buyer/pay/${o.id}` : `/buyer/orders/${o.id}`}
              className="card"
              style={{ ["--pad" as string]: "14px 16px", borderLeft: `5px solid ${d.color}` }}
            >
              <div className="spread">
                <div className="stack" style={{ ["--gap" as string]: "3px" }}>
                  <div className="row" style={{ ["--gap" as string]: "8px" }}>
                    <b>№{o.number}</b>
                    <StatusChip status={o.status === "assembled" ? "confirmed" : o.status} />
                  </div>
                  <span className="small muted">
                    {d.name} · {pn(o.items.length, ["позиция", "позиции", "позиций"])}
                  </span>
                  <span className="tiny muted">
                    {s.name} · {o.status === "issued" ? "получен" : "привоз"} {fmtRelDay(o.deliveryDate)}
                  </span>
                </div>
                <div className="row" style={{ ["--gap" as string]: "6px" }}>
                  <b className="num nowrap">{rub(o.total - o.refund)}</b>
                  <ChevronRight size={18} className="faint" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
