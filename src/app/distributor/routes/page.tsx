"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHead } from "@/components/cabinet/CabinetShell";
import { byId } from "@/lib/engine";
import { fmtRelDay, wdShort } from "@/lib/dates";
import { nextDeliveryDates } from "@/lib/delivery";
import { useAction, useApp } from "@/lib/data/provider";
import { rub } from "@/lib/format";
import type { Route } from "@/lib/types";
import styles from "./routes.module.css";

export default function RoutesPage() {
  const { db, user } = useApp();
  const { run } = useAction();
  const routes = db.routes.filter((r) => r.distributorId === user.distributorId);
  const free = db.stores.filter((s) => s.active && !routes.some((r) => r.storeId === s.id));
  const [add, setAdd] = useState("");

  const patch = (r: Route, p: Partial<Route>) => run("upsertRoute", { ...r, ...p });

  return (
    <>
      <PageHead title="Точки и график" sub="В какие магазины возите, по каким дням и с какой минимальной суммой заказа" />

      <div className="stack" style={{ ["--gap" as string]: "12px" }}>
        {routes.map((r) => {
          const s = byId(db.stores, r.storeId)!;
          const next = nextDeliveryDates(r, 2);
          return (
            <div key={r.id} className={styles.route}>
              <div className={styles.storeCol}>
                <b>{s.name}</b>
                <span className="small muted">{s.address}</span>
                <span className="tiny muted">
                  ближайшие: {next.map(fmtRelDay).join(", ") || "—"}
                </span>
              </div>
              <div className={styles.days} role="group" aria-label="Дни привоза">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                  const on = r.weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      aria-pressed={on}
                      onClick={() =>
                        patch(r, { weekdays: on ? r.weekdays.filter((x) => x !== d) : [...r.weekdays, d].sort() })
                      }
                    >
                      {wdShort(d)}
                    </button>
                  );
                })}
              </div>
              <label className="field">
                <span>Приём до, ч</span>
                <input
                  className="input mono"
                  type="number"
                  min={8}
                  max={23}
                  defaultValue={r.cutoffHour}
                  key={`c${r.cutoffHour}`}
                  onBlur={(e) => +e.target.value !== r.cutoffHour && patch(r, { cutoffHour: +e.target.value })}
                />
              </label>
              <label className="field">
                <span>Минимум, ₽</span>
                <input
                  className="input mono"
                  type="number"
                  step={100}
                  defaultValue={r.minOrder}
                  key={`m${r.minOrder}`}
                  onBlur={(e) => +e.target.value !== r.minOrder && patch(r, { minOrder: +e.target.value })}
                />
              </label>
              <button className="btn btn--ghost btn--icon" aria-label="Убрать точку" onClick={() => run("removeRoute", r.id)}>
                <Trash2 size={17} />
              </button>
            </div>
          );
        })}
      </div>

      {free.length > 0 && (
        <div className="card row wrap" style={{ marginTop: 18 }}>
          <span className="small grow">Подключить магазин платформы:</span>
          <select className="select" style={{ width: "auto" }} value={add} onChange={(e) => setAdd(e.target.value)}>
            <option value="">выберите</option>
            {free.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}, {s.address}
              </option>
            ))}
          </select>
          <button
            className="btn btn--primary"
            disabled={!add}
            onClick={async () => {
              await run("upsertRoute", { distributorId: user.distributorId!, storeId: add, weekdays: [2, 5], cutoffHour: 18, minOrder: 1500 });
              setAdd("");
            }}
          >
            <Plus size={16} /> Добавить
          </button>
        </div>
      )}

      <p className="small muted" style={{ marginTop: 18, maxWidth: 640 }}>
        Изменения графика сразу видны покупателям: даты привоза в каталоге и корзине пересчитываются. Плата магазину за выдачу —{" "}
        {rub(db.stores[0]?.pickupFee ?? 25)} за заказ, по договору с точкой.
      </p>
    </>
  );
}
