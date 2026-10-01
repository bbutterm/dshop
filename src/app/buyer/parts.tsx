"use client";

import Link from "next/link";
import { useState } from "react";
import { Minus, Plus, Truck } from "lucide-react";
import { ProductArt } from "@/components/ProductArt";
import { Sheet } from "@/components/Sheet";
import { byId, findRoute } from "@/lib/engine";
import { fmtRelDay } from "@/lib/dates";
import { nextDeliveryDates } from "@/lib/delivery";
import { useAction, useApp } from "@/lib/data/provider";
import { rub } from "@/lib/format";
import type { Product } from "@/lib/types";
import { buyerStore, qtyInCart, savingPct } from "./lib";
import styles from "./parts.module.css";

export function Stepper({ product, light = false }: { product: Product; light?: boolean }) {
  const { db, user } = useApp();
  const { run } = useAction();
  const store = buyerStore(db, user);
  const qty = qtyInCart(db, user, product.id);
  if (!store) {
    return (
      <Link href="/buyer/stores" className="btn btn--sm">
        Выбрать магазин
      </Link>
    );
  }
  const set = (q: number) => run("cartSet", user.id, store.id, product.id, q);
  if (qty === 0) {
    return (
      <button
        className={styles.add}
        disabled={product.stock === 0}
        onClick={(e) => {
          e.stopPropagation();
          set(1);
        }}
        aria-label={`Добавить ${product.name}`}
      >
        <Plus size={18} strokeWidth={2.6} />
      </button>
    );
  }
  return (
    <div className={`qty ${light ? "qty--light" : ""}`} onClick={(e) => e.stopPropagation()}>
      <button onClick={() => set(qty - 1)} aria-label="Меньше">
        <Minus size={16} />
      </button>
      <span>{qty}</span>
      <button onClick={() => set(qty + 1)} disabled={qty >= product.stock} aria-label="Больше">
        <Plus size={16} />
      </button>
    </div>
  );
}

export function ProductCard({ product, onOpen }: { product: Product; onOpen: (p: Product) => void }) {
  const save = savingPct(product);
  return (
    <div className={styles.card} onClick={() => onOpen(product)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen(product)}>
      <div className={styles.art}>
        <ProductArt product={product} size={240} />
        {product.promo && <span className={styles.promo}>{product.promo}</span>}
        <span className={styles.save}>−{save}%</span>
      </div>
      <div className={styles.info}>
        <div className={styles.name}>{product.name}</div>
        <div className="tiny muted">
          {product.brand} · {product.weight}
        </div>
      </div>
      <div className={styles.buy}>
        <div className={styles.price}>
          <b>{rub(product.price)}</b>
          <s className="tiny faint">{rub(product.shelfPrice)}</s>
        </div>
        <Stepper product={product} />
      </div>
      {product.stock > 0 && product.stock < 5 && <div className={styles.low}>осталось {product.stock}</div>}
      {product.stock === 0 && <div className={styles.low}>нет на складе</div>}
    </div>
  );
}

export function ProductGrid({ products }: { products: Product[] }) {
  const [open, setOpen] = useState<Product | null>(null);
  return (
    <>
      <div className={styles.grid}>
        {products.map((p) => (
          <ProductCard key={p.id} product={p} onOpen={setOpen} />
        ))}
      </div>
      <ProductSheet product={open} onClose={() => setOpen(null)} />
    </>
  );
}

export function ProductSheet({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { db, user } = useApp();
  if (!product) return null;
  // берём свежую версию товара из базы
  const p = byId(db.products, product.id) ?? product;
  const dist = byId(db.distributors, p.distributorId)!;
  const store = buyerStore(db, user);
  const route = store ? findRoute(db, p.distributorId, store.id) : undefined;
  const dates = route ? nextDeliveryDates(route, 2) : [];
  return (
    <Sheet
      open
      onClose={onClose}
      title={<span className="kicker">{p.category}</span>}
      footer={
        <div className="spread">
          <div className={styles.price}>
            <b style={{ fontSize: 22 }}>{rub(p.price)}</b>
            <s className="small faint">на полке {rub(p.shelfPrice)}</s>
          </div>
          <Stepper product={p} />
        </div>
      }
    >
      <div className="stack" style={{ ["--gap" as string]: "16px" }}>
        <div className={styles.sheetArt}>
          <ProductArt product={p} size={220} bg={false} />
        </div>
        <div>
          <div className="h2">{p.name}</div>
          <div className="muted small" style={{ marginTop: 4 }}>
            {p.brand} · {p.weight} · продаётся {p.unit === "шт" ? "поштучно" : `по ${p.unit}.`}
          </div>
        </div>
        <div className={styles.facts}>
          <div>
            <span className="kicker">Экономия</span>
            <b>
              {rub(p.shelfPrice - p.price)} · {savingPct(p)}%
            </b>
          </div>
          <div>
            <span className="kicker">Артикул</span>
            <b className="mono">{p.sku}</b>
          </div>
          <div>
            <span className="kicker">На складе</span>
            <b>
              {p.stock} {p.unit}
            </b>
          </div>
        </div>
        <div className="notice notice--blue">
          <Truck size={18} />
          <span>
            Продаёт и привозит <b>{dist.name}</b>
            {dates.length > 0 && store ? (
              <>
                {" "}
                — ближайший привоз в {store.name} {fmtRelDay(dates[0])}
                {route ? `, минимальный заказ ${rub(route.minOrder)}` : ""}.
              </>
            ) : (
              "."
            )}
          </span>
        </div>
        {p.promo && <div className="notice">Акция поставщика: {p.promo}</div>}
      </div>
    </Sheet>
  );
}
