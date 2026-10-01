"use client";

import { byId, findRoute, routesForStore } from "@/lib/engine";
import { nextDeliveryDates } from "@/lib/delivery";
import type { DB, Product, User } from "@/lib/types";

export function buyerStore(db: DB, user: User) {
  return byId(db.stores, user.favoriteStoreId) ?? null;
}

export function cartOf(db: DB, user: User) {
  return db.carts.find((c) => c.buyerId === user.id) ?? null;
}

export function cartCount(db: DB, user: User) {
  const c = cartOf(db, user);
  if (!c) return 0;
  return Object.values(c.lines).reduce((s, ls) => s + ls.reduce((a, l) => a + l.qty, 0), 0);
}

export function qtyInCart(db: DB, user: User, productId: string) {
  const c = cartOf(db, user);
  if (!c) return 0;
  for (const ls of Object.values(c.lines)) {
    const l = ls.find((x) => x.productId === productId);
    if (l) return l.qty;
  }
  return 0;
}

/** Поставщики, которые возят в магазин, с ближайшими датами */
export function suppliersFor(db: DB, storeId: string) {
  return routesForStore(db, storeId).map((route) => ({
    route,
    distributor: byId(db.distributors, route.distributorId)!,
    dates: nextDeliveryDates(route, 3),
    count: db.products.filter((p) => p.distributorId === route.distributorId && p.active).length,
  }));
}

export function availableProducts(db: DB, storeId: string): Product[] {
  const ids = new Set(routesForStore(db, storeId).map((r) => r.distributorId));
  return db.products.filter((p) => p.active && ids.has(p.distributorId));
}

export function cartBlocks(db: DB, user: User) {
  const c = cartOf(db, user);
  if (!c) return [];
  return Object.entries(c.lines)
    .filter(([, ls]) => ls.length)
    .map(([distributorId, ls]) => {
      const distributor = byId(db.distributors, distributorId)!;
      const route = findRoute(db, distributorId, c.storeId);
      const lines = ls
        .map((l) => ({ ...l, product: byId(db.products, l.productId)! }))
        .filter((l) => l.product);
      const total = lines.reduce((s, l) => s + l.qty * l.product.price, 0);
      const shelf = lines.reduce((s, l) => s + l.qty * l.product.shelfPrice, 0);
      return { distributor, route, lines, total, shelf, dates: route ? nextDeliveryDates(route, 3) : [] };
    });
}

export function savingPct(p: Pick<Product, "price" | "shelfPrice">) {
  return Math.round((1 - p.price / p.shelfPrice) * 100);
}
