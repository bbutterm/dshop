"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, ShoppingBag } from "lucide-react";
import { byId } from "@/lib/engine";
import { useApp } from "@/lib/data/provider";
import { rub } from "@/lib/format";
import { availableProducts, buyerStore, cartBlocks } from "./lib";
import { ProductGrid } from "./parts";
import styles from "./catalog.module.css";

export function CatalogView({ distributorId, initialQuery = "" }: { distributorId?: string; initialQuery?: string }) {
  const { db, user } = useApp();
  const store = buyerStore(db, user);
  const [q, setQ] = useState(initialQuery);
  const [cat, setCat] = useState<string | null>(null);
  const [sup, setSup] = useState<string | null>(distributorId ?? null);

  const all = useMemo(() => (store ? availableProducts(db, store.id) : []), [db, store]);
  const scoped = sup ? all.filter((p) => p.distributorId === sup) : all;
  const cats = [...new Set(scoped.map((p) => p.category))];
  const needle = q.trim().toLowerCase();
  const list = scoped.filter(
    (p) =>
      (!cat || p.category === cat) &&
      (!needle || `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(needle)),
  );
  const supplierIds = [...new Set(all.map((p) => p.distributorId))];
  const blocks = cartBlocks(db, user);
  const block = sup ? blocks.find((b) => b.distributor.id === sup) : undefined;

  if (!store) return <div className="empty">Сначала выберите магазин.</div>;

  return (
    <div className="stack" style={{ ["--gap" as string]: "14px" }}>
      <div className="search">
        <Search size={18} />
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по товарам"
          enterKeyHint="search"
          autoFocus={!!initialQuery}
        />
      </div>

      {!distributorId && supplierIds.length > 1 && (
        <div className="pill-tabs" role="group" aria-label="Поставщик">
          <button aria-pressed={!sup} onClick={() => { setSup(null); setCat(null); }}>
            Все поставщики
          </button>
          {supplierIds.map((id) => {
            const d = byId(db.distributors, id)!;
            return (
              <button key={id} aria-pressed={sup === id} onClick={() => { setSup(id); setCat(null); }}>
                <i style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                {d.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="pill-tabs" role="group" aria-label="Категория">
        <button aria-pressed={!cat} onClick={() => setCat(null)}>
          Всё <span className="count">{scoped.length}</span>
        </button>
        {cats.map((c) => (
          <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c} <span className="count">{scoped.filter((p) => p.category === c).length}</span>
          </button>
        ))}
      </div>

      {list.length ? (
        <ProductGrid products={list} />
      ) : (
        <div className="empty">
          Ничего не нашли{needle ? ` по «${q}»` : ""}.
          <button className="btn btn--sm" onClick={() => { setQ(""); setCat(null); }}>
            Сбросить фильтры
          </button>
        </div>
      )}

      {block && block.route && (
        <Link href="/buyer/cart" className={styles.bar}>
          <span className={styles.barIcon}>
            <ShoppingBag size={18} />
          </span>
          <span className="grow stack" style={{ ["--gap" as string]: "5px" }}>
            <span className="spread" style={{ ["--gap" as string]: "6px" }}>
              <b>{rub(block.total)}</b>
              <span className="tiny" style={{ opacity: 0.75 }}>
                {block.total >= block.route.minOrder
                  ? "минималка набрана"
                  : `ещё ${rub(block.route.minOrder - block.total)} до минималки`}
              </span>
            </span>
            <span className={styles.barProgress}>
              <i style={{ width: `${Math.min(100, (block.total / block.route.minOrder) * 100)}%` }} />
            </span>
          </span>
        </Link>
      )}
    </div>
  );
}
