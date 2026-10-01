"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Clock, MapPin, Navigation } from "lucide-react";
import { fmtRelDay } from "@/lib/dates";
import { useAction, useApp } from "@/lib/data/provider";
import { suppliersFor } from "../lib";
import styles from "./stores.module.css";

const ME = { x: 44, y: 44 };
const dist = (s: { x: number; y: number }) => Math.round(Math.hypot(s.x - ME.x, s.y - ME.y) * 45);

export default function StoresPage() {
  const { db, user } = useApp();
  const { run } = useAction();
  const router = useRouter();
  const [focus, setFocus] = useState<string | null>(user.favoriteStoreId ?? null);
  const stores = [...db.stores].sort((a, b) => Number(b.active) - Number(a.active) || dist(a) - dist(b));

  const choose = async (id: string) => {
    await run("setFavoriteStore", user.id, id);
    router.push("/buyer");
  };

  return (
    <div className="stack fade-in" style={{ ["--gap" as string]: "16px" }}>
      <h1 className="h1">Магазин у дома</h1>

      <div className={styles.map}>
        <svg viewBox="0 0 100 70" preserveAspectRatio="xMidYMid slice" aria-label="Схема района">
          <rect width="100" height="70" fill="#e9e3d4" />
          {/* кварталы */}
          {Array.from({ length: 9 }).map((_, i) =>
            Array.from({ length: 6 }).map((__, j) => (
              <rect key={`${i}-${j}`} x={i * 11 + 2} y={j * 11.5 + 2} width={9} height={9.5} rx={1.2} fill="#f2eee3" />
            )),
          )}
          {/* Десна */}
          <path d="M-5 58 C 15 52, 25 66, 45 60 S 75 46, 105 54 L105 75 L-5 75 Z" fill="#c9d9e3" />
          <path d="M-5 58 C 15 52, 25 66, 45 60 S 75 46, 105 54" fill="none" stroke="#a9c2d1" strokeWidth="0.6" />
          <text x="78" y="60" fontSize="2.6" fill="#5c7f95" fontStyle="italic">р. Десна</text>
          {/* проспект */}
          <path d="M0 30 L100 22" stroke="#fffdf8" strokeWidth="2.4" />
          <path d="M30 0 L52 70" stroke="#fffdf8" strokeWidth="2" />
          <text x="4" y="27.6" fontSize="2.2" fill="#8c958f" transform="rotate(-4.6 4 27.6)">пр-т Станке Димитрова</text>
          {/* вы здесь */}
          <circle cx={ME.x} cy={ME.y * 0.7} r="5" fill="#2f5f8f" opacity="0.15" />
          <circle cx={ME.x} cy={ME.y * 0.7} r="1.6" fill="#2f5f8f" stroke="#fff" strokeWidth="0.6" />
          {stores.map((s) => {
            const on = focus === s.id;
            const fav = user.favoriteStoreId === s.id;
            return (
              <g key={s.id} transform={`translate(${s.x} ${s.y * 0.7})`} onClick={() => s.active && setFocus(s.id)} style={{ cursor: s.active ? "pointer" : "default" }}>
                <path
                  d="M0 0 C -3.2 -3.6 -4.2 -5 -4.2 -6.6 A 4.2 4.2 0 1 1 4.2 -6.6 C 4.2 -5 3.2 -3.6 0 0 Z"
                  fill={!s.active ? "#b9b2a1" : on ? "#e3a82b" : "#1f5a41"}
                  stroke="#17201b"
                  strokeWidth={on ? 0.7 : 0.4}
                  transform={on ? "scale(1.25)" : undefined}
                />
                <circle cx="0" cy={on ? -8.2 : -6.6} r="1.5" fill={fav ? "#17201b" : "#fffdf8"} />
              </g>
            );
          })}
        </svg>
        <span className={styles.me}>
          <Navigation size={12} /> вы здесь
        </span>
      </div>

      <div className="stack" style={{ ["--gap" as string]: "10px" }}>
        {stores.map((s) => {
          const sup = suppliersFor(db, s.id);
          const fav = user.favoriteStoreId === s.id;
          return (
            <div
              key={s.id}
              className={styles.store}
              data-focus={focus === s.id}
              data-off={!s.active}
              onMouseEnter={() => s.active && setFocus(s.id)}
            >
              <div className="spread" style={{ alignItems: "flex-start" }}>
                <div className="stack" style={{ ["--gap" as string]: "3px" }}>
                  <b className={styles.name}>{s.name}</b>
                  <span className="small muted row" style={{ ["--gap" as string]: "4px" }}>
                    <MapPin size={13} /> {s.address} · {dist(s)} м
                  </span>
                  <span className="tiny muted row" style={{ ["--gap" as string]: "4px" }}>
                    <Clock size={12} /> {s.hours} · хранение {s.storageDays} дн.
                  </span>
                </div>
                {s.active ? (
                  fav ? (
                    <span className="chip chip--green chip--plain">
                      <Check size={12} /> ваш
                    </span>
                  ) : (
                    <button className="btn btn--sm btn--primary" onClick={() => choose(s.id)}>
                      Выбрать
                    </button>
                  )
                ) : (
                  <span className="chip chip--plain">скоро</span>
                )}
              </div>
              {s.active && sup.length > 0 && (
                <div className={styles.sups}>
                  {sup.map(({ distributor: d, dates }) => (
                    <span key={d.id} className={styles.sup} style={{ ["--c" as string]: d.color }}>
                      <i />
                      {d.name}
                      <span className="muted"> · {dates[0] ? fmtRelDay(dates[0]) : "—"}</span>
                    </span>
                  ))}
                </div>
              )}
              {!s.active && <span className="tiny muted">Подключаем к пилоту — магазин появится в ноябре.</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
