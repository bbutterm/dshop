"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, LogOut, MapPin, Pencil } from "lucide-react";
import { shelfSum } from "@/lib/engine";
import { useAction, useApp } from "@/lib/data/provider";
import { phoneFmt, pn, rub } from "@/lib/format";
import { buyerStore } from "../lib";

export default function ProfilePage() {
  const { db, user, logout } = useApp();
  const { run } = useAction();
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(user.name);
  const store = buyerStore(db, user);
  const done = db.orders.filter((o) => o.buyerId === user.id && o.status === "issued");
  const spent = done.reduce((s, o) => s + o.total - o.refund, 0);
  const saved = done.reduce((s, o) => s + Math.max(0, shelfSum(db, o.items) - o.total), 0);

  return (
    <div className="stack fade-in" style={{ ["--gap" as string]: "16px" }}>
      <h1 className="h1">Профиль</h1>
      <section className="card stack" style={{ ["--gap" as string]: "12px" }}>
        {edit ? (
          <form
            className="row"
            onSubmit={async (e) => {
              e.preventDefault();
              await run("renameUser", user.id, name);
              setEdit(false);
            }}
          >
            <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <button className="btn btn--primary">Сохранить</button>
          </form>
        ) : (
          <div className="spread">
            <div className="stack" style={{ ["--gap" as string]: "2px" }}>
              <b style={{ fontSize: 18 }}>{user.name}</b>
              <span className="mono small muted">{phoneFmt(user.phone)}</span>
            </div>
            <button className="btn btn--ghost btn--icon btn--sm" onClick={() => setEdit(true)} aria-label="Изменить имя">
              <Pencil size={16} />
            </button>
          </div>
        )}
      </section>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", ["--gap" as string]: "8px" }}>
        <Stat k="заказов" v={String(done.length)} />
        <Stat k="потрачено" v={rub(spent)} />
        <Stat k="сэкономлено" v={rub(saved)} accent />
      </div>

      <Link href="/buyer/stores" className="card spread">
        <span className="row">
          <MapPin size={18} />
          <span className="stack" style={{ ["--gap" as string]: "2px" }}>
            <b className="small">Мой магазин</b>
            <span className="tiny muted">{store ? `${store.name}, ${store.address}` : "не выбран"}</span>
          </span>
        </span>
        <ChevronRight size={18} className="faint" />
      </Link>

      <Link href="/buyer/orders" className="card spread">
        <span className="stack" style={{ ["--gap" as string]: "2px" }}>
          <b className="small">История заказов</b>
          <span className="tiny muted">{pn(db.orders.filter((o) => o.buyerId === user.id).length, ["заказ", "заказа", "заказов"])}</span>
        </span>
        <ChevronRight size={18} className="faint" />
      </Link>

      <section className="card stack" style={{ ["--gap" as string]: "8px" }}>
        <b className="small">Уведомления</b>
        <label className="check small">
          <input type="checkbox" defaultChecked /> В приложении — смена статуса заказа
        </label>
        <label className="check small">
          <input type="checkbox" defaultChecked /> СМС с кодом выдачи
        </label>
        <label className="check small">
          <input type="checkbox" /> Акции поставщиков моего магазина
        </label>
      </section>

      <button
        className="btn btn--ghost"
        onClick={() => {
          logout();
          router.push("/login");
        }}
      >
        <LogOut size={16} /> Выйти
      </button>
    </div>
  );
}

function Stat({ k, v, accent = false }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="card stack" style={{ ["--pad" as string]: "12px", ["--gap" as string]: "2px" }}>
      <b className="display" style={{ fontSize: 17, fontWeight: 600, color: accent ? "var(--green)" : undefined }}>
        {v}
      </b>
      <span className="tiny muted">{k}</span>
    </div>
  );
}
