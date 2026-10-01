import { BAKALEYA, DESNA } from "./catalog";
import { addDays, parseDate, today } from "./dates";
import { nextDeliveryDates, prevDeliveryDate } from "./delivery";
import { orderSum } from "./engine";
import type { DB, Order, OrderEvent, OrderItem, OrderStatus, Product, Route, Store, User } from "./types";

export const DB_VERSION = 6;

export const DEMO = {
  buyer: "u-anna",
  store: "u-tatiana",
  distributor: "u-sergey",
  admin: "u-admin",
};

const stores: Store[] = [
  { id: "s-romashka", name: "«Ромашка»", address: "ул. Ромашина, 32", district: "Советский район", hours: "8:00–22:00", x: 38, y: 34, capacity: 24, storageDays: 3, pickupFee: 25, active: true },
  { id: "s-ryadom", name: "Минимаркет «Рядом»", address: "ул. Бежицкая, 1/4", district: "Бежицкий район", hours: "7:00–23:00", x: 64, y: 22, capacity: 16, storageDays: 3, pickupFee: 25, active: true },
  { id: "s-sergeich", name: "Продукты у Сергеича", address: "пр-т Станке Димитрова, 67", district: "Советский район", hours: "9:00–21:00", x: 52, y: 62, capacity: 12, storageDays: 2, pickupFee: 20, active: true },
  { id: "s-volna", name: "«Волна»", address: "ул. Литейная, 50", district: "Володарский район", hours: "8:00–21:00", x: 22, y: 72, capacity: 14, storageDays: 3, pickupFee: 25, active: false },
];

const users: User[] = [
  { id: DEMO.buyer, role: "buyer", name: "Анна Соколова", phone: "79101234567", favoriteStoreId: "s-romashka" },
  { id: DEMO.store, role: "store", name: "Татьяна Ивановна", phone: "79107654321", storeId: "s-romashka" },
  { id: DEMO.distributor, role: "distributor", name: "Сергей Кольцов", phone: "79051112233", distributorId: "d-desna" },
  { id: DEMO.admin, role: "admin", name: "Команда «Закупки»", phone: "79000000000" },
  { id: "u-oleg", role: "distributor", name: "Олег Панин", phone: "79052223344", distributorId: "d-b32" },
  { id: "u-nina", role: "store", name: "Нина Петрова", phone: "79201110000", storeId: "s-ryadom" },
  { id: "u-viktor", role: "store", name: "Виктор Сергеевич", phone: "79201110001", storeId: "s-sergeich" },
  { id: "u-masha", role: "buyer", name: "Мария Лапина", phone: "79201110002" },
  { id: "u-igor", role: "buyer", name: "Игорь Мельников", phone: "79101110003", favoriteStoreId: "s-romashka" },
  { id: "u-olga", role: "buyer", name: "Ольга Ветрова", phone: "79101110004", favoriteStoreId: "s-romashka" },
  { id: "u-pavel", role: "buyer", name: "Павел Ершов", phone: "79101110005", favoriteStoreId: "s-ryadom" },
  { id: "u-elena", role: "buyer", name: "Елена Кузина", phone: "79101110006", favoriteStoreId: "s-romashka" },
  { id: "u-dmitry", role: "buyer", name: "Дмитрий Орлов", phone: "79101110007", favoriteStoreId: "s-sergeich" },
  { id: "u-irina", role: "buyer", name: "Ирина Белова", phone: "79101110008", favoriteStoreId: "s-romashka" },
  // разовые покупатели — пришли по листовке, попробовали один раз
  ...["Светлана Жукова", "Артём Филин", "Наталья Сорокина", "Роман Гусев", "Юлия Миронова"].map((name, i) => ({
    id: `u-guest${i}`,
    role: "buyer" as const,
    name,
    phone: `7910222000${i}`,
    favoriteStoreId: "s-romashka",
  })),
];

const routes: Route[] = [
  { id: "r-1", distributorId: "d-desna", storeId: "s-romashka", weekdays: [2, 5], cutoffHour: 18, minOrder: 1500 },
  { id: "r-2", distributorId: "d-desna", storeId: "s-ryadom", weekdays: [3, 6], cutoffHour: 18, minOrder: 1500 },
  { id: "r-3", distributorId: "d-desna", storeId: "s-sergeich", weekdays: [2, 5], cutoffHour: 18, minOrder: 2000 },
  { id: "r-4", distributorId: "d-b32", storeId: "s-romashka", weekdays: [1, 4], cutoffHour: 16, minOrder: 2000 },
  { id: "r-5", distributorId: "d-b32", storeId: "s-sergeich", weekdays: [3, 6], cutoffHour: 16, minOrder: 2000 },
];

// детерминированный генератор, чтобы демо выглядело одинаково после сброса
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function createSeed(): DB {
  const rand = rng(42);
  const products: Product[] = [
    ...DESNA.map((p, i) => ({ ...p, id: `p-d${i}`, distributorId: "d-desna", stock: 20 + Math.floor(rand() * 60), active: true })),
    ...BAKALEYA.map((p, i) => ({ ...p, id: `p-b${i}`, distributorId: "d-b32", stock: 15 + Math.floor(rand() * 50), active: true })),
  ];
  products[5].stock = 3; // «Алёнка» почти закончилась — видно предупреждение

  const db: DB = {
    version: DB_VERSION,
    users: structuredClone(users),
    stores: structuredClone(stores),
    distributors: [
      { id: "d-desna", name: "ТД «Деснапродукт»", short: "DP", about: "Кондитерка, чай. Склад на ул. Транспортной, свои машины по Брянску.", color: "#B8322A", inn: "3250012345", hasAcquiring: true, active: true },
      { id: "d-b32", name: "Бакалея-32", short: "B32", about: "Крупы, макароны, масло, консервы, кофе. Возит по Советскому району.", color: "#1F5FA8", inn: "3257098765", hasAcquiring: true, active: true },
    ],
    routes: structuredClone(routes),
    products,
    orders: [],
    trips: [],
    notifications: [],
    carts: [],
    seq: 100,
  };

  const T = today();
  let num = 1000;
  const byRoute = (d: string, s: string) => db.routes.find((r) => r.distributorId === d && r.storeId === s)!;

  function mk(opts: {
    buyer: string;
    dist: string;
    store: string;
    date: string;
    items: [number, number][]; // [индекс товара поставщика, кол-во]
    status: OrderStatus;
    short?: boolean;
  }): Order {
    num += 1;
    const pool = products.filter((p) => p.distributorId === opts.dist);
    const items: OrderItem[] = opts.items.map(([i, q]) => {
      const p = pool[i % pool.length];
      return { productId: p.id, name: p.name, unit: p.unit, price: p.price, qty: q };
    });
    const created = new Date(parseDate(addDays(opts.date, -2)).getTime() + (9 + rand() * 10) * 3600_000);
    const t = (h: number) => new Date(created.getTime() + h * 3600_000).toISOString();
    const dist = db.distributors.find((d) => d.id === opts.dist)!;
    const store = db.stores.find((s) => s.id === opts.store)!;
    const total = orderSum(items);
    const h: OrderEvent[] = [
      { at: t(0), status: "awaiting_payment", text: "Заказ создан, ожидает оплаты", by: "buyer" },
    ];
    const steps: OrderStatus[] = ["placed", "confirmed", "assembled", "in_transit", "at_store", "issued"];
    const target = opts.status === "unclaimed" || opts.status === "returned" ? "at_store" : opts.status;
    const upto = steps.indexOf(target);
    const texts: Record<string, string> = {
      placed: `Оплачено ${total} ₽, чек отправлен в СМС`,
      confirmed: "Подтверждён полностью",
      assembled: `Собран и промаркирован: ${dist.short}-${num}`,
      in_transit: "Едет с поставкой, ГАЗель Т 482 ОК",
      at_store: "Принят магазином",
      issued: "Выдан покупателю",
    };
    // ранние шаги — от момента заказа, поздние — от утра дня привоза
    const day = parseDate(opts.date).getTime();
    const d = (h: number) => new Date(day + h * 3600_000).toISOString();
    const pickupH = 17 + rand() * 4 + (rand() < 0.4 ? 24 : 0);
    const at: Record<string, string> = { placed: t(0.1), confirmed: t(2 + rand() * 3), assembled: d(6.5), in_transit: d(8.2), at_store: d(10.5 + rand()), issued: d(pickupH) };
    for (let i = 0; i <= upto; i++) {
      const s = steps[i];
      h.push({ at: at[s], status: s, text: texts[s], by: s === "placed" ? "buyer" : s === "at_store" || s === "issued" ? "store" : "distributor" });
    }
    if (opts.status === "unclaimed" || opts.status === "returned") {
      h.push({ at: d(24 * store.storageDays + 21), status: "unclaimed", text: "Срок хранения истёк, отмечен невыкуп", by: "store" });
    }
    if (opts.status === "returned") {
      h.push({ at: d(24 * (store.storageDays + 2) + 9), status: "returned", text: "Невыкуп забран поставщиком", by: "distributor" });
    }
    if (opts.status === "cancelled") {
      h.push({ at: t(1), status: "cancelled", text: "Покупатель отменил заказ", by: "buyer" });
    }
    const confirmedStage = upto >= 1;
    const atStageReached = upto >= 4;
    for (const it of items) {
      if (confirmedStage) it.confirmedQty = it.qty;
      if (atStageReached) it.receivedQty = it.qty;
    }
    let refund = 0;
    if (opts.short && confirmedStage) {
      items[0].confirmedQty = Math.max(0, items[0].qty - 1);
      if (atStageReached) items[0].receivedQty = items[0].confirmedQty;
      refund = items[0].price;
      h[2] = { ...h[2], text: `Подтверждён частично, возврат ${items[0].price} ₽` };
    }
    const slotNo = db.orders.filter((o) => o.storeId === opts.store && (o.status === "at_store" || o.status === "unclaimed")).length + 1;
    const o: Order = {
      id: `o-${num}`,
      number: String(num),
      buyerId: opts.buyer,
      distributorId: opts.dist,
      storeId: opts.store,
      deliveryDate: opts.date,
      items,
      status: opts.status,
      total,
      refund: opts.status === "cancelled" ? total : refund,
      pickupCode: String(100000 + Math.floor(rand() * 899999)),
      label: `${dist.short}-${num}`,
      tripId: upto >= 3 ? `t-${opts.dist}-${opts.date}` : undefined,
      shelfSlot: opts.status === "at_store" || opts.status === "unclaimed" ? `А-${String(slotNo).padStart(2, "0")}` : undefined,
      storedUntil: atStageReached ? addDays(opts.date, store.storageDays) : undefined,
      payment: { method: "card_link", paidAt: opts.status === "awaiting_payment" ? undefined : t(0.1), receiptNo: `ФД ${30000 + num}` },
      createdAt: t(0),
      updatedAt: h[h.length - 1].at,
      history: h,
    };
    db.orders.push(o);
    if (upto >= 3 && !db.trips.find((x) => x.id === o.tripId)) {
      db.trips.push({ id: o.tripId!, distributorId: opts.dist, date: opts.date, storeIds: [opts.store], driver: "Алексей Т.", vehicle: "ГАЗель Т 482 ОК", status: "done" });
    } else if (o.tripId) {
      const tr = db.trips.find((x) => x.id === o.tripId)!;
      if (!tr.storeIds.includes(opts.store)) tr.storeIds.push(opts.store);
    }
    return o;
  }

  // --- история за 5 недель: выданные заказы, чтобы были метрики пилота ---
  const buyers = ["u-anna", "u-igor", "u-olga", "u-elena", "u-irina", "u-masha", "u-pavel", "u-dmitry"];
  const r1 = byRoute("d-desna", "s-romashka");
  let d = prevDeliveryDate(r1, addDays(T, -5));
  const historyDates: string[] = [];
  for (let i = 0; i < 10; i++) {
    historyDates.push(d);
    d = prevDeliveryDate(r1, d);
  }
  historyDates.reverse();
  historyDates.forEach((date, i) => {
    const n = 2 + Math.floor(i / 3) + Math.floor(rand() * 2); // спрос растёт от недели к неделе
    for (let k = 0; k < n; k++) {
      const guest = i >= 4 && k === n - 1 && i - 4 < 5;
      const b = guest ? `u-guest${i - 4}` : buyers[Math.floor(rand() * (i < 4 ? 4 : buyers.length))];
      const items: [number, number][] = [];
      const lines = 2 + Math.floor(rand() * 3);
      for (let j = 0; j < lines; j++) items.push([Math.floor(rand() * 18), 1 + Math.floor(rand() * 2)]);
      const status: OrderStatus = i === 6 && k === 0 ? "returned" : "issued";
      mk({ buyer: b, dist: "d-desna", store: b === "u-pavel" ? "s-ryadom" : b === "u-dmitry" ? "s-sergeich" : "s-romashka", date, items, status, short: i === 3 && k === 1 });
    }
  });
  // бакалея тоже возила
  const r4 = byRoute("d-b32", "s-romashka");
  let d4 = prevDeliveryDate(r4, addDays(T, -4));
  for (let i = 0; i < 5; i++) {
    mk({ buyer: buyers[i % 5], dist: "d-b32", store: "s-romashka", date: d4, items: [[i, 1], [i + 4, 1], [10, 1]], status: "issued" });
    d4 = prevDeliveryDate(r4, d4);
  }

  // --- текущие заказы в разных статусах ---
  const last = prevDeliveryDate(r1, addDays(T, 1)); // ближайший прошедший или сегодняшний привоз
  const next1 = nextDeliveryDates(r1, 2)[0];
  const next2 = nextDeliveryDates(byRoute("d-desna", "s-ryadom"), 1)[0];

  // у Анны: один заказ ждёт в магазине, один едет / собирается
  mk({ buyer: "u-anna", dist: "d-desna", store: "s-romashka", date: last, items: [[0, 1], [7, 2], [16, 1]], status: "at_store" });
  mk({ buyer: "u-igor", dist: "d-desna", store: "s-romashka", date: last, items: [[2, 1], [12, 1], [8, 1]], status: "at_store" });
  mk({ buyer: "u-olga", dist: "d-desna", store: "s-romashka", date: last, items: [[4, 1], [9, 2]], status: "at_store" });
  const old = prevDeliveryDate(r1, addDays(last, -0));
  const expired = mk({ buyer: "u-irina", dist: "d-desna", store: "s-romashka", date: old, items: [[13, 1], [15, 1]], status: "at_store" });
  expired.storedUntil = addDays(T, -1); // срок истёк — магазину есть что отметить невыкупом

  // на ближайший рейс
  mk({ buyer: "u-elena", dist: "d-desna", store: "s-romashka", date: next1, items: [[1, 1], [10, 1], [3, 1]], status: "assembled" });
  mk({ buyer: "u-igor", dist: "d-desna", store: "s-romashka", date: next1, items: [[6, 1], [11, 2], [17, 1]], status: "confirmed" });
  mk({ buyer: "u-masha", dist: "d-desna", store: "s-ryadom", date: next2, items: [[0, 1], [5, 1]], status: "confirmed" });
  // новые, ждут подтверждения дистрибьютора
  mk({ buyer: "u-olga", dist: "d-desna", store: "s-romashka", date: next1, items: [[2, 2], [7, 1], [14, 1], [16, 1]], status: "placed" });
  mk({ buyer: "u-pavel", dist: "d-desna", store: "s-ryadom", date: next2, items: [[5, 3], [8, 1]], status: "placed" });
  mk({ buyer: "u-dmitry", dist: "d-desna", store: "s-sergeich", date: nextDeliveryDates(byRoute("d-desna", "s-sergeich"), 1)[0], items: [[0, 2], [17, 1], [12, 2]], status: "placed" });

  // бакалея: у Анны едет крупа
  const nextB = nextDeliveryDates(r4, 1)[0];
  mk({ buyer: "u-anna", dist: "d-b32", store: "s-romashka", date: nextB, items: [[0, 1], [4, 1], [8, 1]], status: "confirmed" });


  // обращение для админки
  const disputed = db.orders.find((o) => o.status === "issued" && o.buyerId === "u-olga");
  if (disputed) disputed.dispute = { text: "В коробке «Птичьего молока» помята упаковка, конфеты целые. Можно скидку на следующий заказ?", at: new Date(Date.now() - 5 * 3600_000).toISOString(), resolved: false };

  db.orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // корзина Анны — чтобы в демо было что оформить сразу
  db.carts.push({
    buyerId: "u-anna",
    storeId: "s-romashka",
    lines: { "d-desna": [{ productId: "p-d8", qty: 1 }, { productId: "p-d12", qty: 1 }, { productId: "p-d0", qty: 2 }] },
  });

  // стартовые уведомления
  const ann = db.orders.find((o) => o.buyerId === "u-anna" && o.status === "at_store")!;
  const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  db.notifications.push(
    { id: "n-1", userId: "u-anna", at: ago(50), title: `Заказ №${ann.number} ждёт вас`, body: `«Ромашка», ул. Ромашина, 32. Код выдачи ${ann.pickupCode}.`, href: `/buyer/orders/${ann.id}`, read: false, tone: "good" },
    { id: "n-2", userId: "u-sergey", at: ago(35), title: "3 новых заказа ждут подтверждения", body: "Ромашка, Рядом, у Сергеича. Подтвердите до 18:00 накануне привоза.", href: "/distributor/orders", read: false, tone: "info" },
    { id: "n-3", userId: "u-tatiana", at: ago(120), title: "Срок хранения истёк", body: `Заказ №${expired.number} (ячейка ${expired.shelfSlot}) не забрали. Отметьте невыкуп.`, href: "/store/shelf", read: false, tone: "warn" },
    { id: "n-4", userId: "u-admin", at: ago(300), title: "Обращение покупателя", body: "Помятая упаковка — Ольга Ветрова.", href: "/admin/orders", read: false, tone: "warn" },
  );
  return db;
}
