// Бизнес-логика заказа. Чистые функции над объектом DB: вызываются локальным источником
// данных сейчас и переедут в RPC/edge-функции Supabase без изменения правил.

import { addDays, fmtRelDay, today } from "./dates";
import { nextDeliveryDates } from "./delivery";
import { pn, rub } from "./format";
import type {
  DB,
  Notification,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  Role,
  Route,
  Trip,
  User,
} from "./types";

export class DomainError extends Error {}

const now = () => new Date().toISOString();

export function nextId(db: DB, prefix: string): string {
  db.seq += 1;
  return `${prefix}${db.seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function rand6(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ---------- выборки ----------

export const byId = <T extends { id: string }>(list: T[], id: string | undefined) =>
  list.find((x) => x.id === id);

export function findRoute(db: DB, distributorId: string, storeId: string): Route | undefined {
  return db.routes.find((r) => r.distributorId === distributorId && r.storeId === storeId);
}

export function routesForStore(db: DB, storeId: string): Route[] {
  return db.routes.filter(
    (r) => r.storeId === storeId && byId(db.distributors, r.distributorId)?.active,
  );
}

export function orderSum(items: OrderItem[], mode: "ordered" | "confirmed" | "received" = "ordered") {
  return items.reduce((s, it) => {
    const q =
      mode === "ordered"
        ? it.qty
        : mode === "confirmed"
          ? (it.confirmedQty ?? it.qty)
          : (it.receivedQty ?? it.confirmedQty ?? it.qty);
    return s + q * it.price;
  }, 0);
}

export function shelfSum(db: DB, items: OrderItem[]) {
  return items.reduce((s, it) => {
    const p = byId(db.products, it.productId);
    return s + it.qty * (p?.shelfPrice ?? it.price);
  }, 0);
}

export function staffOf(db: DB, storeId: string): User[] {
  return db.users.filter((u) => u.role === "store" && u.storeId === storeId);
}

export function managersOf(db: DB, distributorId: string): User[] {
  return db.users.filter((u) => u.role === "distributor" && u.distributorId === distributorId);
}

export const ACTIVE_STATUSES: OrderStatus[] = [
  "placed",
  "confirmed",
  "assembled",
  "in_transit",
  "at_store",
];

// ---------- служебное ----------

export function notify(
  db: DB,
  userIds: string[],
  n: Omit<Notification, "id" | "userId" | "at" | "read">,
) {
  for (const userId of userIds) {
    db.notifications.unshift({
      ...n,
      id: nextId(db, "n"),
      userId,
      at: now(),
      read: false,
    });
  }
  if (db.notifications.length > 400) db.notifications.length = 400;
}

function log(order: Order, status: Order["history"][number]["status"], text: string, by: Role | "system") {
  order.history.push({ at: now(), status, text, by });
  order.updatedAt = now();
  if (status !== "note") order.status = status;
}

function getOrder(db: DB, id: string): Order {
  const o = byId(db.orders, id);
  if (!o) throw new DomainError("Заказ не найден");
  return o;
}

function expect(o: Order, ...allowed: OrderStatus[]) {
  if (!allowed.includes(o.status))
    throw new DomainError(`Действие недоступно в статусе «${STATUS_LABEL[o.status]}»`);
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: "ждёт оплаты",
  placed: "оформлен",
  confirmed: "подтверждён",
  assembled: "собран",
  in_transit: "в пути",
  at_store: "в магазине",
  issued: "выдан",
  unclaimed: "невыкуп",
  returned: "возвращён",
  cancelled: "отменён",
};

/** Этапы, которые видит покупатель на шкале заказа */
export const BUYER_STEPS: { key: OrderStatus; label: string }[] = [
  { key: "placed", label: "Оформлен" },
  { key: "confirmed", label: "Подтверждён" },
  { key: "in_transit", label: "В пути" },
  { key: "at_store", label: "В магазине" },
  { key: "issued", label: "Выдан" },
];

export function stepIndex(s: OrderStatus): number {
  const order: OrderStatus[] = ["placed", "confirmed", "assembled", "in_transit", "at_store", "issued"];
  const i = order.indexOf(s);
  if (i < 0) return -1;
  return [0, 1, 1, 2, 3, 4][i];
}

function freeSlot(db: DB, storeId: string): string {
  const taken = new Set(
    db.orders
      .filter((o) => o.storeId === storeId && (o.status === "at_store" || o.status === "unclaimed"))
      .map((o) => o.shelfSlot),
  );
  const rows = "АБВГДЕЖ";
  for (const r of rows)
    for (let i = 1; i <= 8; i++) {
      const s = `${r}-${String(i).padStart(2, "0")}`;
      if (!taken.has(s)) return s;
    }
  return "пол";
}

// ---------- покупатель ----------

export function setFavoriteStore(db: DB, userId: string, storeId: string) {
  const u = byId(db.users, userId);
  if (!u) throw new DomainError("Пользователь не найден");
  u.favoriteStoreId = storeId;
  const cart = db.carts.find((c) => c.buyerId === userId);
  if (cart) cart.storeId = storeId;
}

export function cartSet(db: DB, buyerId: string, storeId: string, productId: string, qty: number) {
  const p = byId(db.products, productId);
  if (!p) throw new DomainError("Товар не найден");
  let cart = db.carts.find((c) => c.buyerId === buyerId);
  if (!cart) {
    cart = { buyerId, storeId, lines: {} };
    db.carts.push(cart);
  }
  cart.storeId = storeId;
  const lines = (cart.lines[p.distributorId] ??= []);
  const line = lines.find((l) => l.productId === productId);
  const q = Math.max(0, Math.min(qty, p.stock));
  if (q === 0) {
    cart.lines[p.distributorId] = lines.filter((l) => l.productId !== productId);
    if (cart.lines[p.distributorId].length === 0) delete cart.lines[p.distributorId];
  } else if (line) line.qty = q;
  else lines.push({ productId, qty: q });
}

export function placeOrder(
  db: DB,
  buyerId: string,
  distributorId: string,
  deliveryDate: string,
): Order {
  const buyer = byId(db.users, buyerId);
  const cart = db.carts.find((c) => c.buyerId === buyerId);
  if (!buyer || !cart) throw new DomainError("Корзина пуста");
  const lines = cart.lines[distributorId] ?? [];
  if (!lines.length) throw new DomainError("Корзина этого поставщика пуста");
  const route = findRoute(db, distributorId, cart.storeId);
  if (!route) throw new DomainError("Поставщик не возит в выбранный магазин");
  if (!nextDeliveryDates(route, 6).includes(deliveryDate))
    throw new DomainError("На эту дату заказ уже не принимается");

  const items: OrderItem[] = lines.map((l) => {
    const p = byId(db.products, l.productId)!;
    if (!p.active) throw new DomainError(`«${p.name}» снят с продажи`);
    if (p.stock < l.qty) throw new DomainError(`«${p.name}»: на складе ${p.stock} ${p.unit}`);
    return { productId: p.id, name: p.name, unit: p.unit, price: p.price, qty: l.qty };
  });
  const total = orderSum(items);
  if (total < route.minOrder)
    throw new DomainError(`Минимальный заказ у поставщика — ${rub(route.minOrder)}`);

  const num = 1000 + db.orders.length + 1;
  const dist = byId(db.distributors, distributorId)!;
  const order: Order = {
    id: nextId(db, "o"),
    number: String(num),
    buyerId,
    distributorId,
    storeId: cart.storeId,
    deliveryDate,
    items,
    status: "awaiting_payment",
    total,
    refund: 0,
    pickupCode: rand6(),
    label: `${dist.short}-${num}`,
    payment: { method: dist.hasAcquiring ? "card_link" : "agent_cash" },
    createdAt: now(),
    updatedAt: now(),
    history: [],
  };
  log(order, "awaiting_payment", "Заказ создан, ожидает оплаты", "buyer");
  db.orders.unshift(order);
  return order;
}

/** Заглушка эквайринга: оплата по ссылке дистрибьютора прошла успешно */
export function payOrder(db: DB, orderId: string): Order {
  const o = getOrder(db, orderId);
  expect(o, "awaiting_payment");
  o.payment.paidAt = now();
  o.payment.receiptNo = `ФД ${Math.floor(10000 + Math.random() * 89999)}`;
  for (const it of o.items) {
    const p = byId(db.products, it.productId);
    if (p) p.stock = Math.max(0, p.stock - it.qty);
  }
  const cart = db.carts.find((c) => c.buyerId === o.buyerId);
  if (cart) delete cart.lines[o.distributorId];
  log(o, "placed", `Оплачено ${rub(o.total)}, чек ${o.payment.receiptNo} отправлен в СМС`, "buyer");

  const store = byId(db.stores, o.storeId)!;
  notify(db, [o.buyerId], {
    title: `Заказ №${o.number} оплачен`,
    body: `Чек от дистрибьютора пришёл в СМС. Привоз — ${fmtRelDay(o.deliveryDate)}, ${store.name}.`,
    href: `/buyer/orders/${o.id}`,
    tone: "good",
  });
  notify(db, managersOf(db, o.distributorId).map((u) => u.id), {
    title: `Новый заказ №${o.number} · ${rub(o.total)}`,
    body: `${pn(o.items.length, ["позиция", "позиции", "позиций"])}, ${store.name}, привоз ${fmtRelDay(o.deliveryDate)}. Нужно подтвердить.`,
    href: `/distributor/orders/${o.id}`,
    tone: "info",
  });
  return o;
}

export function cancelOrder(db: DB, orderId: string, by: Role, reason = "") {
  const o = getOrder(db, orderId);
  expect(o, "awaiting_payment", "placed");
  const paid = o.status === "placed";
  if (paid) {
    o.refund = o.total;
    for (const it of o.items) {
      const p = byId(db.products, it.productId);
      if (p) p.stock += it.qty;
    }
  }
  log(o, "cancelled", by === "buyer" ? "Покупатель отменил заказ" : `Отклонён: ${reason || "без причины"}`, by);
  if (by === "buyer" && paid) {
    notify(db, managersOf(db, o.distributorId).map((u) => u.id), {
      title: `Заказ №${o.number} отменён покупателем`,
      body: `Возврат ${rub(o.total)} по ссылке оплаты.`,
      href: `/distributor/orders/${o.id}`,
      tone: "warn",
    });
  }
  if (by !== "buyer") {
    notify(db, [o.buyerId], {
      title: `Заказ №${o.number} отклонён поставщиком`,
      body: `${reason || "Поставщик не сможет привезти заказ"}. Деньги ${rub(o.total)} вернутся на карту.`,
      href: `/buyer/orders/${o.id}`,
      tone: "warn",
    });
  }
}

export function openDispute(db: DB, orderId: string, text: string) {
  const o = getOrder(db, orderId);
  o.dispute = { text, at: now(), resolved: false };
  log(o, "note", `Покупатель открыл обращение: «${text}»`, "buyer");
  notify(db, db.users.filter((u) => u.role === "admin").map((u) => u.id), {
    title: `Обращение по заказу №${o.number}`,
    body: text,
    href: `/admin/orders?open=${o.id}`,
    tone: "warn",
  });
}

// ---------- дистрибьютор ----------

export function confirmOrder(db: DB, orderId: string, qty: Record<string, number>) {
  const o = getOrder(db, orderId);
  expect(o, "placed");
  const missing: string[] = [];
  for (const it of o.items) {
    const q = Math.max(0, Math.min(it.qty, qty[it.productId] ?? it.qty));
    it.confirmedQty = q;
    if (q < it.qty) {
      missing.push(`${it.name} — ${q} из ${it.qty}`);
      const p = byId(db.products, it.productId);
      if (p) p.stock += it.qty - q;
    }
  }
  const confirmedTotal = orderSum(o.items, "confirmed");
  if (confirmedTotal === 0) {
    cancelOrder(db, orderId, "distributor", "Ни одной позиции нет в наличии");
    return;
  }
  o.refund = o.total - confirmedTotal;
  log(
    o,
    "confirmed",
    missing.length ? `Подтверждён частично, возврат ${rub(o.refund)}` : "Подтверждён полностью",
    "distributor",
  );
  notify(db, [o.buyerId], {
    title: missing.length ? `Заказ №${o.number} подтверждён частично` : `Заказ №${o.number} подтверждён`,
    body: missing.length
      ? `Нет в наличии: ${missing.join("; ")}. Вернём ${rub(o.refund)} на карту.`
      : `Поставщик собирает заказ к ${fmtRelDay(o.deliveryDate)}.`,
    href: `/buyer/orders/${o.id}`,
    tone: missing.length ? "warn" : "good",
  });
}

export function assembleOrders(db: DB, orderIds: string[]) {
  for (const id of orderIds) {
    const o = getOrder(db, id);
    expect(o, "confirmed");
    log(o, "assembled", `Собран и промаркирован: ${o.label}`, "distributor");
  }
}

/** Отправка рейса: собранные заказы на дату уезжают в магазины, невыкуп забирается обратно */
export function dispatchTrip(
  db: DB,
  distributorId: string,
  date: string,
  driver: string,
  vehicle: string,
): Trip {
  const orders = db.orders.filter(
    (o) => o.distributorId === distributorId && o.deliveryDate === date && o.status === "assembled",
  );
  if (!orders.length) throw new DomainError("Нет собранных заказов на эту дату");
  const storeIds = [...new Set(orders.map((o) => o.storeId))];
  const trip: Trip = {
    id: nextId(db, "t"),
    distributorId,
    date,
    storeIds,
    driver,
    vehicle,
    status: "on_road",
  };
  db.trips.unshift(trip);
  const dist = byId(db.distributors, distributorId)!;
  for (const o of orders) {
    o.tripId = trip.id;
    log(o, "in_transit", `Едет с поставкой, ${vehicle}`, "distributor");
    notify(db, [o.buyerId], {
      title: `Заказ №${o.number} в пути`,
      body: `Едет в ${byId(db.stores, o.storeId)?.name} с обычной поставкой. Пришлём код, как только магазин примет.`,
      href: `/buyer/orders/${o.id}`,
      tone: "info",
    });
  }
  for (const sid of storeIds) {
    const n = orders.filter((o) => o.storeId === sid).length;
    const back = db.orders.filter(
      (o) => o.storeId === sid && o.distributorId === distributorId && o.status === "unclaimed",
    ).length;
    notify(db, staffOf(db, sid).map((u) => u.id), {
      title: `${dist.name}: едет ${pn(n, ["заказ", "заказа", "заказов"])}`,
      body: `Поставка ${fmtRelDay(date)}, ${vehicle}.${back ? ` Водитель заберёт невыкуп: ${back}.` : ""}`,
      href: `/store/incoming`,
      tone: "info",
    });
  }
  return trip;
}

export function upsertRoute(db: DB, r: Omit<Route, "id"> & { id?: string }) {
  if (r.id) {
    const ex = byId(db.routes, r.id);
    if (!ex) throw new DomainError("Маршрут не найден");
    Object.assign(ex, r);
    return ex;
  }
  const route: Route = { ...r, id: nextId(db, "r") };
  db.routes.push(route);
  return route;
}

export function removeRoute(db: DB, id: string) {
  db.routes = db.routes.filter((r) => r.id !== id);
}

export function updateProduct(db: DB, id: string, patch: Partial<Product>) {
  const p = byId(db.products, id);
  if (!p) throw new DomainError("Товар не найден");
  Object.assign(p, patch);
}

export interface ImportRow {
  sku: string;
  name: string;
  price: number;
  unit?: string;
  stock?: number;
  category?: string;
  brand?: string;
  weight?: string;
  shelfPrice?: number;
}

const ARTS: Product["art"][] = ["box", "bag", "pack", "jar", "can", "bar", "bottle", "tin"];
const TINTS = ["#B8322A", "#2F6FB0", "#D8913A", "#4E6B2A", "#6B3A1E", "#E2B33B", "#7B2B3A", "#2D5D8C"];

/** Загрузка прайса: обновляем по артикулу, новые позиции добавляем */
export function importPrice(db: DB, distributorId: string, rows: ImportRow[]) {
  let updated = 0;
  let added = 0;
  for (const r of rows) {
    const ex = db.products.find((p) => p.distributorId === distributorId && p.sku === r.sku);
    if (ex) {
      ex.price = r.price;
      if (r.stock !== undefined) ex.stock = r.stock;
      if (r.name) ex.name = r.name;
      if (r.shelfPrice) ex.shelfPrice = r.shelfPrice;
      ex.active = true;
      updated++;
    } else {
      const unit = (["шт", "уп", "кор", "бут", "пач"].includes(r.unit ?? "") ? r.unit : "шт") as Product["unit"];
      const h = [...r.sku].reduce((a, c) => a + c.charCodeAt(0), 0);
      db.products.push({
        id: nextId(db, "p"),
        distributorId,
        sku: r.sku,
        name: r.name,
        brand: r.brand ?? "",
        category: r.category ?? "Разное",
        unit,
        pack: 1,
        weight: r.weight ?? "",
        price: r.price,
        shelfPrice: r.shelfPrice ?? Math.round(r.price * 1.3),
        stock: r.stock ?? 50,
        art: ARTS[h % ARTS.length],
        tint: TINTS[h % TINTS.length],
        active: true,
      });
      added++;
    }
  }
  return { updated, added };
}

// ---------- магазин ----------

export function receiveOrder(db: DB, orderId: string, received?: Record<string, number>) {
  const o = getOrder(db, orderId);
  expect(o, "in_transit");
  const store = byId(db.stores, o.storeId)!;
  const short: string[] = [];
  for (const it of o.items) {
    const conf = it.confirmedQty ?? it.qty;
    const q = Math.max(0, Math.min(conf, received?.[it.productId] ?? conf));
    it.receivedQty = q;
    if (q < conf) short.push(`${it.name} — ${q} из ${conf}`);
  }
  const receivedTotal = orderSum(o.items, "received");
  o.refund = o.total - receivedTotal;
  o.shelfSlot = freeSlot(db, o.storeId);
  o.storedUntil = addDays(today(), store.storageDays);
  log(
    o,
    "at_store",
    short.length ? `Принят с недовозом (${short.join("; ")}), ячейка ${o.shelfSlot}` : `Принят магазином, ячейка ${o.shelfSlot}`,
    "store",
  );
  notify(db, [o.buyerId], {
    title: `Заказ №${o.number} ждёт вас`,
    body: `${store.name}, ${store.address}. Код выдачи ${o.pickupCode}. Хранится до ${fmtRelDay(o.storedUntil)}.${short.length ? ` Недовоз, вернём ${rub(o.refund)}.` : ""}`,
    href: `/buyer/orders/${o.id}`,
    tone: "good",
  });
  if (short.length) {
    notify(db, managersOf(db, o.distributorId).map((u) => u.id), {
      title: `Недовоз в заказе №${o.number}`,
      body: `${store.name}: ${short.join("; ")}. Покупателю нужно вернуть ${rub(o.refund)}.`,
      href: `/distributor/orders/${o.id}`,
      tone: "warn",
    });
  }
}

export function findByLabel(db: DB, storeId: string, label: string): Order | undefined {
  const l = label.trim().toUpperCase().replace(/\s+/g, "");
  return db.orders.find(
    (o) => o.storeId === storeId && (o.label.toUpperCase() === l || o.number === l.replace(/\D/g, "")),
  );
}

export function findByCode(db: DB, storeId: string, code: string): Order | undefined {
  const c = code.replace(/\D/g, "");
  return db.orders.find((o) => o.storeId === storeId && o.pickupCode === c);
}

export function issueOrder(db: DB, orderId: string) {
  const o = getOrder(db, orderId);
  expect(o, "at_store");
  const store = byId(db.stores, o.storeId)!;
  log(o, "issued", `Выдан покупателю, ячейка ${o.shelfSlot} свободна`, "store");
  notify(db, [o.buyerId], {
    title: `Заказ №${o.number} выдан`,
    body: `Спасибо! Экономия на этом заказе — ${rub(Math.max(0, shelfSum(db, o.items) - o.total))} против полки.`,
    href: `/buyer/orders/${o.id}`,
    tone: "good",
  });
  notify(db, managersOf(db, o.distributorId).map((u) => u.id), {
    title: `Выдан заказ №${o.number}`,
    body: `${store.name}. Плата магазину за выдачу — ${rub(store.pickupFee)}.`,
    href: `/distributor/orders/${o.id}`,
    tone: "good",
  });
}

export function markUnclaimed(db: DB, orderId: string) {
  const o = getOrder(db, orderId);
  expect(o, "at_store");
  log(o, "unclaimed", "Срок хранения истёк, отмечен невыкуп", "store");
  notify(db, [o.buyerId], {
    title: `Заказ №${o.number} не забрали`,
    body: "Срок хранения закончился, заказ вернётся поставщику. Напишите в поддержку, если это ошибка.",
    href: `/buyer/orders/${o.id}`,
    tone: "warn",
  });
  notify(db, managersOf(db, o.distributorId).map((u) => u.id), {
    title: `Невыкуп по заказу №${o.number}`,
    body: `${byId(db.stores, o.storeId)?.name}: заберите следующим рейсом.`,
    href: `/distributor/orders/${o.id}`,
    tone: "warn",
  });
}

export function returnUnclaimed(db: DB, orderId: string) {
  const o = getOrder(db, orderId);
  expect(o, "unclaimed");
  log(o, "returned", "Невыкуп забран поставщиком", "distributor");
  for (const it of o.items) {
    const p = byId(db.products, it.productId);
    if (p) p.stock += it.receivedQty ?? it.confirmedQty ?? it.qty;
  }
}

export function extendStorage(db: DB, orderId: string, days: number) {
  const o = getOrder(db, orderId);
  expect(o, "at_store");
  o.storedUntil = addDays(o.storedUntil ?? today(), days);
  log(o, "note", `Хранение продлено до ${fmtRelDay(o.storedUntil)}`, "store");
  notify(db, [o.buyerId], {
    title: `Хранение заказа №${o.number} продлено`,
    body: `Магазин подождёт до ${fmtRelDay(o.storedUntil)}.`,
    href: `/buyer/orders/${o.id}`,
    tone: "info",
  });
}

// ---------- админка ----------

export function attachStaff(db: DB, userId: string, storeId: string | undefined) {
  const u = byId(db.users, userId);
  if (!u) throw new DomainError("Пользователь не найден");
  u.role = storeId ? "store" : "buyer";
  u.storeId = storeId;
  if (storeId) {
    notify(db, [u.id], {
      title: "Вас привязали к магазину",
      body: `${byId(db.stores, storeId)?.name}: теперь в приложении открывается интерфейс продавца.`,
      href: "/store",
      tone: "info",
    });
  }
}

export function resolveDispute(db: DB, orderId: string, answer: string) {
  const o = getOrder(db, orderId);
  if (!o.dispute) return;
  o.dispute.resolved = true;
  log(o, "note", `Поддержка: ${answer}`, "admin");
  notify(db, [o.buyerId], {
    title: `Ответ по заказу №${o.number}`,
    body: answer,
    href: `/buyer/orders/${o.id}`,
    tone: "info",
  });
}
