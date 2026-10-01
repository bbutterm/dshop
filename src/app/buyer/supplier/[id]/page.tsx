"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { byId, findRoute } from "@/lib/engine";
import { fmtRelDay, wdShort } from "@/lib/dates";
import { nextDeliveryDates } from "@/lib/delivery";
import { useApp } from "@/lib/data/provider";
import { rub } from "@/lib/format";
import { buyerStore } from "../../lib";
import { CatalogView } from "../../CatalogView";

export default function SupplierPage() {
  const { id } = useParams<{ id: string }>();
  const { db, user } = useApp();
  const d = byId(db.distributors, id);
  const store = buyerStore(db, user);
  if (!d) return <div className="empty">Поставщик не найден</div>;
  const route = store ? findRoute(db, d.id, store.id) : undefined;
  const dates = route ? nextDeliveryDates(route, 3) : [];

  return (
    <div className="stack fade-in" style={{ ["--gap" as string]: "16px" }}>
      <Link href="/buyer" className="back">
        <ArrowLeft size={16} /> Назад
      </Link>
      <div
        className="card stack"
        style={{ ["--pad" as string]: "18px", ["--gap" as string]: "12px", borderTop: `6px solid ${d.color}` }}
      >
        <div className="stack" style={{ ["--gap" as string]: "4px" }}>
          <h1 className="h1">{d.name}</h1>
          <p className="small muted">{d.about}</p>
        </div>
        {route ? (
          <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", ["--gap" as string]: "8px" }}>
            <Fact k="Возит" v={route.weekdays.map(wdShort).join(", ")} />
            <Fact k="Ближайший" v={dates[0] ? fmtRelDay(dates[0]) : "—"} />
            <Fact k="Минимум" v={rub(route.minOrder)} />
          </div>
        ) : (
          <div className="notice notice--tomato">Этот поставщик не возит в ваш магазин.</div>
        )}
        <span className="tiny muted row" style={{ ["--gap" as string]: "5px" }}>
          <BadgeCheck size={14} /> Продавец по чеку — {d.name}, ИНН {d.inn}. Онлайн-касса поставщика.
        </span>
      </div>
      <CatalogView distributorId={d.id} />
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="stack" style={{ ["--gap" as string]: "2px", padding: "8px 10px", background: "var(--paper)", borderRadius: 10 }}>
      <span className="kicker" style={{ fontSize: 10 }}>{k}</span>
      <b className="small">{v}</b>
    </div>
  );
}
