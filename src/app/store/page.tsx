"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Delete, PackageOpen, ScanLine } from "lucide-react";
import { CodeDigits } from "@/components/Codes";
import { canScan, ScannerSheet, vibrate } from "@/components/Scanner";
import { byId, findByCode } from "@/lib/engine";
import { fmtRelDay, isoDate, today } from "@/lib/dates";
import { useAction, useApp } from "@/lib/data/provider";
import { pn, rub } from "@/lib/format";
import type { Order } from "@/lib/types";
import styles from "./issue.module.css";

export default function IssuePage() {
  const { db, user } = useApp();
  const { run, pending } = useAction();
  const storeId = user.storeId!;
  const [code, setCode] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState<Order | null>(null);
  const [scanning, setScanning] = useState(false);
  const camera = useSyncExternalStore(() => () => {}, canScan, () => false);
  const sideRef = useRef<HTMLElement>(null);

  const mine = db.orders.filter((o) => o.storeId === storeId);
  const onShelf = mine.filter((o) => o.status === "at_store");
  const issuedToday = mine.filter((o) => o.status === "issued" && isoDate(new Date(o.updatedAt)) === today());
  const found = picked ? byId(db.orders, picked) : code.length === 6 ? findByCode(db, storeId, code) : undefined;
  const wrong = code.length === 6 && !found;
  const store = byId(db.stores, storeId)!;

  const onScan = useCallback((value: string) => {
    setScanning(false);
    setPicked(null);
    setDone(null);
    setCode(value.replace(/\D/g, "").slice(0, 6));
  }, []);

  const hasResult = !!found || !!done;
  useEffect(() => {
    // на телефоне карточка заказа под клавиатурой — подтягиваем её в зону видимости
    if (hasResult && window.innerWidth < 760) sideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hasResult]);

  const press = (k: string) => {
    setDone(null);
    setPicked(null);
    if (k === "del") setCode((c) => c.slice(0, -1));
    else if (k === "clr") setCode("");
    else setCode((c) => (c.length < 6 ? c + k : c));
  };

  const reset = () => {
    setCode("");
    setPicked(null);
  };

  return (
    <div className={styles.layout}>
      <section className={styles.pad}>
        <div className="stack" style={{ ["--gap" as string]: "4px" }}>
          <h1 className="h1">Выдача заказа</h1>
          <span className="small muted">Введите код покупателя или отсканируйте QR</span>
        </div>

        <div className={styles.display} data-state={wrong ? "wrong" : found ? "ok" : "idle"}>
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className={styles.cell} data-fill={!!code[i]}>
              {code[i] ?? ""}
            </span>
          ))}
        </div>
        {wrong && <div className={styles.err}>Такого кода нет среди заказов на полке. Проверьте цифры.</div>}

        <div className={styles.keys}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clr", "0", "del"].map((k) => (
            <button key={k} className={styles.key} onClick={() => press(k)} data-k={k}>
              {k === "del" ? <Delete size={22} /> : k === "clr" ? "Сброс" : k}
            </button>
          ))}
        </div>
        <button
          className="btn btn--block"
          onClick={() => {
            if (camera) return setScanning(true);
            const o = onShelf[Math.floor(Math.random() * onShelf.length)];
            if (o) {
              setCode(o.pickupCode);
              setDone(null);
            }
          }}
          disabled={!camera && !onShelf.length}
        >
          <ScanLine size={18} /> {camera ? "Сканировать QR камерой" : "Сканировать QR (демо)"}
        </button>
        <ScannerSheet
          open={scanning}
          onClose={() => setScanning(false)}
          onResult={onScan}
          title="QR покупателя"
          hint="Наведите камеру на QR-код на экране покупателя"
        />
      </section>

      <section className={styles.side} ref={sideRef}>
        {done && !found && (
          <div className={`card stack fade-in ${styles.success}`}>
            <span className="stamp" style={{ color: "var(--green)", alignSelf: "flex-start" }}>
              Выдан
            </span>
            <b>
              Заказ №{done.number} выдан, ячейка {done.shelfSlot} свободна
            </b>
            <span className="small muted">Покупатель и поставщик получили уведомление. Плата за выдачу +{rub(store.pickupFee)}.</span>
          </div>
        )}

        {found ? (
          <OrderToIssue
            order={found}
            busy={!!pending}
            onCancel={reset}
            onIssue={async () => {
              await run("issueOrder", found.id);
              vibrate(25);
              setDone(found);
              reset();
            }}
          />
        ) : (
          <>
            <div className={styles.stats}>
              <Stat n={onShelf.length} label="на полке" />
              <Stat n={issuedToday.length} label="выдано сегодня" />
              <Stat n={`${onShelf.length}/${store.capacity}`} label="занято мест" />
            </div>
            <div className="stack" style={{ ["--gap" as string]: "8px" }}>
              <div className="kicker">Ждут покупателей</div>
              {onShelf.length === 0 && <div className="empty">Полка пуста</div>}
              {onShelf.map((o) => {
                const b = byId(db.users, o.buyerId);
                const late = (o.storedUntil ?? "9") < today();
                return (
                  <button key={o.id} className={styles.row} onClick={() => { setPicked(o.id); setCode(""); setDone(null); }}>
                    <span className={styles.slot}>{o.shelfSlot}</span>
                    <span className="grow stack" style={{ ["--gap" as string]: "1px", textAlign: "left" }}>
                      <b className="small">
                        №{o.number} · {b?.name}
                      </b>
                      <span className="tiny muted">
                        {byId(db.distributors, o.distributorId)?.name} · {pn(o.items.length, ["позиция", "позиции", "позиций"])}
                      </span>
                    </span>
                    <span className={`tiny ${late ? "" : "muted"}`} style={late ? { color: "var(--tomato)", fontWeight: 600 } : undefined}>
                      {late ? "срок истёк" : `до ${fmtRelDay(o.storedUntil!)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="card stack" style={{ ["--pad" as string]: "12px 14px", ["--gap" as string]: "0" }}>
      <b className="display" style={{ fontSize: 24, fontWeight: 600 }}>
        {n}
      </b>
      <span className="tiny muted">{label}</span>
    </div>
  );
}

function OrderToIssue({ order: o, onIssue, onCancel, busy }: { order: Order; onIssue: () => void; onCancel: () => void; busy: boolean }) {
  const { db } = useApp();
  const b = byId(db.users, o.buyerId);
  const d = byId(db.distributors, o.distributorId)!;
  if (o.status !== "at_store") {
    return (
      <div className="card stack fade-in">
        <b>Заказ №{o.number}</b>
        <span className="muted small">
          {o.status === "issued" ? "Этот заказ уже выдан." : "Заказ ещё не принят на полку — сначала приёмка."}
        </span>
        <button className="btn" onClick={onCancel}>
          Назад
        </button>
      </div>
    );
  }
  return (
    <div className={`card stack fade-in ${styles.found}`} style={{ ["--gap" as string]: "14px" }}>
      <div className="spread" style={{ alignItems: "flex-start" }}>
        <div className="stack" style={{ ["--gap" as string]: "2px" }}>
          <span className="kicker">Заказ №{o.number}</span>
          <b style={{ fontSize: 18 }}>{b?.name}</b>
          <span className="tiny muted">{d.name} · код <CodeDigits code={o.pickupCode} /></span>
        </div>
        <div className={styles.bigSlot}>
          <span className="kicker" style={{ color: "inherit" }}>ячейка</span>
          <b>{o.shelfSlot}</b>
        </div>
      </div>
      <div className={styles.items}>
        {o.items.map((it) => {
          const q = it.receivedQty ?? it.confirmedQty ?? it.qty;
          if (!q) return null;
          return (
            <label key={it.productId} className="check small">
              <input type="checkbox" />
              <span className="grow">{it.name}</span>
              <b className="mono">
                {q} {it.unit}
              </b>
            </label>
          );
        })}
      </div>
      <div className="notice notice--green small">
        <PackageOpen size={16} /> Оплачен онлайн — деньги брать не нужно. Отдайте пакет с маркировкой {o.label}.
      </div>
      <div className="row">
        <button className="btn btn--primary btn--lg grow" onClick={onIssue} disabled={busy}>
          Выдать
        </button>
        <button className="btn btn--lg" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}
