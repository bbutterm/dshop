"use client";

import { useState } from "react";
import { PageHead } from "@/components/cabinet/CabinetShell";
import { routesForStore } from "@/lib/engine";
import { useAction, useApp } from "@/lib/data/provider";
import { phoneFmt, pn, rub } from "@/lib/format";

export default function Participants() {
  const { db } = useApp();
  const { run } = useAction();
  const [tab, setTab] = useState<"stores" | "dist" | "staff">("stores");
  const staff = db.users.filter((u) => u.role === "store" || u.role === "buyer");

  return (
    <>
      <PageHead title="Участники" sub="Подключение магазинов и дистрибьюторов, привязка продавцов к точкам" />
      <div className="pill-tabs" style={{ marginBottom: 16 }}>
        <button aria-pressed={tab === "stores"} onClick={() => setTab("stores")}>
          Магазины <span className="count">{db.stores.length}</span>
        </button>
        <button aria-pressed={tab === "dist"} onClick={() => setTab("dist")}>
          Дистрибьюторы <span className="count">{db.distributors.length}</span>
        </button>
        <button aria-pressed={tab === "staff"} onClick={() => setTab("staff")}>
          Сотрудники
        </button>
      </div>

      {tab === "stores" && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Магазин</th>
                <th>Поставщики</th>
                <th className="r">Мест</th>
                <th className="r">Хранение, дн</th>
                <th className="r">За выдачу</th>
                <th>Подключён</th>
              </tr>
            </thead>
            <tbody>
              {db.stores.map((s) => (
                <tr key={s.id}>
                  <td>
                    <b>{s.name}</b>
                    <div className="tiny muted">
                      {s.address} · {s.district}
                    </div>
                  </td>
                  <td className="small">{pn(routesForStore(db, s.id).length, ["поставщик", "поставщика", "поставщиков"])}</td>
                  <td className="r">
                    <NumIn value={s.capacity} onSave={(v) => run("updateStore", s.id, { capacity: v })} />
                  </td>
                  <td className="r">
                    <NumIn value={s.storageDays} onSave={(v) => run("updateStore", s.id, { storageDays: v })} />
                  </td>
                  <td className="r mono">{rub(s.pickupFee)}</td>
                  <td>
                    <label className="check">
                      <input type="checkbox" checked={s.active} onChange={() => run("toggleStore", s.id)} />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "dist" && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Дистрибьютор</th>
                <th>ИНН</th>
                <th>Эквайринг</th>
                <th className="r">Товаров</th>
                <th className="r">Точек</th>
                <th>Активен</th>
              </tr>
            </thead>
            <tbody>
              {db.distributors.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className="row" style={{ ["--gap" as string]: "8px" }}>
                      <i style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />
                      <b>{d.name}</b>
                    </span>
                    <div className="tiny muted">{d.about}</div>
                  </td>
                  <td className="mono small">{d.inn}</td>
                  <td>{d.hasAcquiring ? <span className="chip chip--green">онлайн-касса</span> : <span className="chip chip--mustard">агентский чек</span>}</td>
                  <td className="r mono">{db.products.filter((p) => p.distributorId === d.id).length}</td>
                  <td className="r mono">{db.routes.filter((r) => r.distributorId === d.id).length}</td>
                  <td>
                    <label className="check">
                      <input type="checkbox" checked={d.active} onChange={() => run("toggleDistributor", d.id)} />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "staff" && (
        <>
          <p className="small muted" style={{ marginBottom: 12, maxWidth: 640 }}>
            Продавец входит по номеру телефона, как покупатель. Привязка к магазину переключает ему интерфейс на пункт выдачи.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Человек</th>
                  <th>Телефон</th>
                  <th>Привязан к магазину</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <b className="small">{u.name}</b>
                      <div className="tiny muted">{u.role === "store" ? "продавец" : "покупатель"}</div>
                    </td>
                    <td className="mono small">{phoneFmt(u.phone)}</td>
                    <td>
                      <select
                        className="select"
                        style={{ minHeight: 36, maxWidth: 280 }}
                        value={u.role === "store" ? u.storeId : ""}
                        onChange={(e) => run("attachStaff", u.id, e.target.value || undefined)}
                      >
                        <option value="">— не продавец —</option>
                        {db.stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function NumIn({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  return (
    <input
      className="input mono"
      type="number"
      min={1}
      style={{ width: 72, minHeight: 34, padding: "4px 8px", textAlign: "right" }}
      defaultValue={value}
      key={value}
      onBlur={(e) => +e.target.value > 0 && +e.target.value !== value && onSave(+e.target.value)}
    />
  );
}
