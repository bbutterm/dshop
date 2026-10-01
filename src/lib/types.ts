// Доменная модель. Таблицы повторяют будущую схему Supabase (supabase/schema.sql),
// поэтому поля названы так же, как колонки, только в camelCase.

export type Role = "buyer" | "store" | "distributor" | "admin";

export interface User {
  id: string;
  role: Role;
  name: string;
  phone: string;
  /** для сотрудника магазина — к какому магазину привязан */
  storeId?: string;
  /** для менеджера дистрибьютора — какой дистрибьютор */
  distributorId?: string;
  /** для покупателя — выбранный магазин */
  favoriteStoreId?: string;
}

export interface Store {
  id: string;
  name: string;
  address: string;
  district: string;
  hours: string;
  /** условные координаты на схеме района, 0..100 */
  x: number;
  y: number;
  /** сколько заказов помещается на полку выдачи */
  capacity: number;
  /** срок хранения, дней */
  storageDays: number;
  /** плата магазину за выдачу, ₽ за заказ */
  pickupFee: number;
  active: boolean;
}

export interface Distributor {
  id: string;
  name: string;
  short: string;
  about: string;
  /** фирменный цвет ярлыка — чтобы корзины разных поставщиков различались */
  color: string;
  inn: string;
  hasAcquiring: boolean;
  active: boolean;
}

/** Точка и график: какой дистрибьютор в какой магазин и по каким дням возит */
export interface Route {
  id: string;
  distributorId: string;
  storeId: string;
  /** дни недели 1..7 (пн..вс) */
  weekdays: number[];
  /** до скольки часов накануне принимаются заказы */
  cutoffHour: number;
  minOrder: number;
}

export type Unit = "шт" | "уп" | "кор" | "бут" | "пач";

export interface Product {
  id: string;
  distributorId: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  unit: Unit;
  /** сколько штук в единице продажи, для пояснения «уп. 6 шт» */
  pack: number;
  weight: string;
  price: number;
  shelfPrice: number;
  stock: number;
  /** форма упаковки для иллюстрации */
  art: "bag" | "box" | "bar" | "jar" | "bottle" | "can" | "pack" | "tin";
  /** цвет упаковки */
  tint: string;
  promo?: string;
  active: boolean;
}

export type OrderStatus =
  | "awaiting_payment"
  | "placed" // оформлен и оплачен
  | "confirmed" // подтверждён дистрибьютором по позициям
  | "assembled" // собран и промаркирован
  | "in_transit" // в пути с поставкой
  | "at_store" // принят магазином, лежит на полке
  | "issued" // выдан
  | "unclaimed" // срок хранения истёк, отмечен невыкуп
  | "returned" // невыкуп забран дистрибьютором
  | "cancelled";

export interface OrderItem {
  productId: string;
  name: string;
  unit: Unit;
  price: number;
  qty: number;
  /** сколько подтвердил дистрибьютор; undefined — ещё не подтверждал */
  confirmedQty?: number;
  /** сколько реально приехало в магазин */
  receivedQty?: number;
}

export interface OrderEvent {
  at: string;
  status: OrderStatus | "note";
  text: string;
  by: Role | "system";
}

export interface Order {
  id: string;
  number: string;
  buyerId: string;
  distributorId: string;
  storeId: string;
  deliveryDate: string; // YYYY-MM-DD
  items: OrderItem[];
  status: OrderStatus;
  total: number;
  /** сумма к возврату покупателю за недовоз/отказ по позициям */
  refund: number;
  pickupCode: string;
  /** маркировка на пакете — то, что сканирует магазин */
  label: string;
  tripId?: string;
  shelfSlot?: string;
  storedUntil?: string;
  payment: { method: "card_link" | "agent_cash"; paidAt?: string; receiptNo?: string };
  createdAt: string;
  updatedAt: string;
  history: OrderEvent[];
  dispute?: { text: string; at: string; resolved: boolean };
}

export interface Trip {
  id: string;
  distributorId: string;
  date: string;
  storeIds: string[];
  driver: string;
  vehicle: string;
  status: "planned" | "loading" | "on_road" | "done";
}

export interface Notification {
  id: string;
  userId: string;
  at: string;
  title: string;
  body: string;
  href?: string;
  read: boolean;
  tone: "info" | "good" | "warn";
}

export interface CartLine {
  productId: string;
  qty: number;
}

/** Корзины покупателя: отдельная на каждого поставщика */
export interface Cart {
  buyerId: string;
  storeId: string;
  lines: Record<string, CartLine[]>; // distributorId -> lines
}

export interface DB {
  version: number;
  users: User[];
  stores: Store[];
  distributors: Distributor[];
  routes: Route[];
  products: Product[];
  orders: Order[];
  trips: Trip[];
  notifications: Notification[];
  carts: Cart[];
  seq: number;
}
