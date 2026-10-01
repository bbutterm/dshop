"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Camera, Minus, PackageCheck, Plus, ScanLine, Truck } from "lucide-react";
import { canScan, ScannerSheet } from "@/components/Scanner";
import { Barcode } from "@/components/Codes";
import { Sheet } from "@/components/Sheet";
import { StatusChip } from "@/components/StatusChip";
import { byId, findByLabel } from "@/lib/engine";
import { fmtRelDay } from "@/lib/dates";
import { useAction, useApp } from "@/lib/data/provider";
import { pn } from "@/lib/format";
import type { Order } from "@/lib/types";
import styles from "./incoming.module.css";

export default function IncomingPage() {
  const { db, user, toast } = useApp();
  const { run } = useAction();
  const storeId = user.storeId!;
  const [scan, setScan] = useState("");
  const [open, setOpen] = useState<Order | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const camera = useSyncExternalStore(() => () => {}, canScan, () => false);

  const mine = db.orders.filter((o) => o.storeId === storeId);
  const moving = mine.filter((o) => o.status === "in_transit");
  const expected = mine.filter((o) => o.status === "confirmed" || o.status === "assembled");
  const back = mine.filter((o) => o.status === "unclaimed");

  const groups = (list: Order[]) => {
    const m = new Map<string, Order[]>();
    for (const o of list) {
      const k = `${o.distributorId}|${o.deliveryDate}`;
      m.set(k, [...(m.get(k) ?? []), o]);
    }
    return [...m.entries()].map(([k, orders]) => {
      const [did, date] = k.split("|");
      return { distributor: byId(db.distributors, did)!, date, orders };
    });
  };

  const lookup = (value: string) => {
    const o = findByLabel(db, storeId, value);
    if (!o) toast({ title: `Маркировка «${value}» не найдена`, body: "Проверьте, что пакет адресован в этот магазин.", tone: "error" });
    else if (o.status !== "in_transit") toast({ title: `Заказ №${o.number} уже ${o.status === "at_store" ? "на полке" : "обработан"}`, tone: "warn" });
    else setOpen(o);
    setScan("");
  };
  const onScan = (value: string) => {
    setScanning(false);
    lookup(value);
  };

  const acceptAll = async (orders: Order[]) => {
    for (const o of orders) await run("receiveOrder", o.id);
    toast({ title: `Принято ${pn(orders.length, ["заказ", "заказа", "заказов"])}`, body: "Покупатели получили коды выдачи.", tone: "good" });
  };

  return (
    <div className="stack fade-in" style={{ ["--gap" as string]: "22px" }}>
      <div className="stack" style={{ ["--gap" as string]: "4px" }}>
        <h1 className="h1">Приёмка поставки</h1>
        <span className="small muted">Сканируйте маркировку на пакете — распаковывать не нужно.</span>
      </div>

      <form
        className={styles.scan}
        onSubmit={(e) => {
          e.preventDefault();
          lookup(scan);
        }}
      >
        <ScanLine size={22} />
        <input
          ref={input}
          className={styles.scanInput}
          value={scan}
          onChange={(e) => setScan(e.target.value.toUpperCase())}
          placeholder="DP-1047 или номер заказа"
        />
        {camera && (
          <button type="button" className="btn btn--icon" onClick={() => setScanning(true)} aria-label="Сканировать камерой">
            <Camera size={18} />
          </button>
        )}
        <button className="btn btn--accent">Найти</button>
      </form>
      <ScannerSheet
        open={scanning}
        onClose={() => setScanning(false)}
        onResult={onScan}
        title="Маркировка пакета"
        hint="Наведите камеру на штрихкод на наклейке заказа"
      />

      <section className="stack">
        <div className="section-title">
          <h2 className="h2">Едут сейчас</h2>
          <span className="small muted">{pn(moving.length, ["заказ", "заказа", "заказов"])}</span>
        </div>
        {moving.length === 0 && <div className="empty">Машин в пути нет. Как только поставщик отправит рейс — здесь появятся заказы.</div>}
        {groups(moving).map((g) => (
          <div key={g.distributor.id + g.date} className="card stack" style={{ ["--gap" as string]: "12px" }}>
            <div className="spread">
              <div className="row">
                <span className={styles.truck} style={{ background: g.distributor.color }}>
                  <Truck size={18} />
                </span>
                <div className="stack" style={{ ["--gap" as string]: "1px" }}>
                  <b>{g.distributor.name}</b>
                  <span className="tiny muted">
                    {fmtRelDay(g.date)} · {db.trips.find((t) => t.id === g.orders[0].tripId)?.vehicle ?? "рейс"}
                  </span>
                </div>
              </div>
              <button className="btn btn--primary btn--sm" onClick={() => acceptAll(g.orders)}>
                Принять все {g.orders.length}
              </button>
            </div>
            <div className={styles.list}>
              {g.orders.map((o) => (
                <div key={o.id} className={styles.parcel}>
                  <div className={styles.label}>
                    <Barcode value={o.label} width={110} height={26} />
                    <span className="mono tiny">{o.label}</span>
                  </div>
                  <span className="grow small">
                    <b>№{o.number}</b>
                    <span className="muted"> · {pn(o.items.length, ["позиция", "позиции", "позиций"])}</span>
                  </span>
                  <button className="btn btn--sm" onClick={() => setOpen(o)}>
                    Проверить
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {expected.length > 0 && (
        <section className="stack">
          <div className="section-title">
            <h2 className="h2">Ожидаются</h2>
            <span className="small muted">поставщик собирает</span>
          </div>
          {groups(expected).map((g) => (
            <div key={g.distributor.id + g.date} className="card spread" style={{ ["--pad" as string]: "12px 16px" }}>
              <div className="stack" style={{ ["--gap" as string]: "2px" }}>
                <b className="small">{g.distributor.name}</b>
                <span className="tiny muted">
                  {fmtRelDay(g.date)} · {pn(g.orders.length, ["заказ", "заказа", "заказов"])} · займут {g.orders.length} мест на полке
                </span>
              </div>
              <StatusChip status="confirmed" label="ожидается" />
            </div>
          ))}
        </section>
      )}

      {back.length > 0 && (
        <section className="notice">
          <AlertTriangle size={18} />
          <span className="small">
            Отдать водителю невыкуп: {back.map((o) => `№${o.number} (${byId(db.distributors, o.distributorId)?.short})`).join(", ")}.
          </span>
        </section>
      )}

      {open && <ReceiveSheet order={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ReceiveSheet({ order, onClose }: { order: Order; onClose: () => void }) {
  const { run, pending } = useAction();
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(order.items.map((it) => [it.productId, it.confirmedQty ?? it.qty])),
  );
  const short = order.items.some((it) => qty[it.productId] < (it.confirmedQty ?? it.qty));
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Заказ №${order.number}`}
      footer={
        <button
          className="btn btn--primary btn--block btn--lg"
          disabled={!!pending}
          onClick={async () => {
            await run("receiveOrder", order.id, qty);
            onClose();
          }}
        >
          <PackageCheck size={18} /> {short ? "Принять с недовозом" : "Принять на полку"}
        </button>
      }
    >
      <div className="stack">
        <span className="small muted">Проверьте позиции по накладной. Если чего-то нет — уменьшите количество, покупателю вернут деньги.</span>
        {order.items.map((it) => {
          const max = it.confirmedQty ?? it.qty;
          const q = qty[it.productId];
          return (
            <div key={it.productId} className="spread" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="small grow">
                {it.name}
                {q < max && <span style={{ color: "var(--tomato)" }}> · недовоз {max - q}</span>}
              </span>
              <div className="qty qty--light">
                <button onClick={() => setQty((s) => ({ ...s, [it.productId]: Math.max(0, q - 1) }))} aria-label="Меньше">
                  <Minus size={16} />
                </button>
                <span>
                  {q}/{max}
                </span>
                <button onClick={() => setQty((s) => ({ ...s, [it.productId]: Math.min(max, q + 1) }))} aria-label="Больше">
                  <Plus size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
