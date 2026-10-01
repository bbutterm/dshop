"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Printer } from "lucide-react";
import { Barcode } from "@/components/Codes";
import { LogoMark } from "@/components/Logo";
import { byId } from "@/lib/engine";
import { fmtDay } from "@/lib/dates";
import { useApp } from "@/lib/data/provider";
import { pn } from "@/lib/format";
import styles from "./labels.module.css";

function Labels() {
  const { db } = useApp();
  const ids = (useSearchParams().get("ids") ?? "").split(",").filter(Boolean);
  const orders = ids.map((id) => byId(db.orders, id)).filter((o) => !!o);
  return (
    <div className={styles.page}>
      <div className={`${styles.bar} no-print`}>
        <b>Маркировка · {pn(orders.length, ["наклейка", "наклейки", "наклеек"])}</b>
        <button className="btn btn--primary btn--sm" onClick={() => window.print()}>
          <Printer size={15} /> Печать
        </button>
      </div>
      <div className={styles.grid}>
        {orders.map((o) => {
          const s = byId(db.stores, o.storeId)!;
          const d = byId(db.distributors, o.distributorId)!;
          const b = byId(db.users, o.buyerId);
          const units = o.items.reduce((a, it) => a + (it.confirmedQty ?? it.qty), 0);
          return (
            <div key={o.id} className={styles.label}>
              <div className={styles.top}>
                <LogoMark size={20} />
                <span className="mono tiny">{d.short} · {fmtDay(o.deliveryDate)}</span>
              </div>
              <div className={styles.store}>{s.name}</div>
              <div className="tiny">{s.address}</div>
              <div className={styles.num}>№{o.number}</div>
              <div className="tiny">
                {b?.name.split(" ").map((w, i) => (i ? w[0] + "." : w)).join(" ")} · {pn(units, ["место", "места", "мест"])}
              </div>
              <div className={styles.code}>
                <Barcode value={o.label} width={220} height={46} />
                <span className="mono">{o.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LabelsPage() {
  return (
    <Suspense>
      <Labels />
    </Suspense>
  );
}
