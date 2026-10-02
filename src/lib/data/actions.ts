import * as E from "../engine";
import type { DB, User } from "../types";

/**
 * Реестр команд. Локальный источник выполняет их над DB в браузере,
 * Supabase-источник будет вызывать одноимённые RPC (supabase/schema.sql).
 */
export const actions = {
  setFavoriteStore: E.setFavoriteStore,
  cartSet: E.cartSet,
  placeOrder: E.placeOrder,
  payOrder: E.payOrder,
  cancelOrder: E.cancelOrder,
  openDispute: E.openDispute,
  confirmOrder: E.confirmOrder,
  assembleOrders: E.assembleOrders,
  dispatchTrip: E.dispatchTrip,
  upsertRoute: E.upsertRoute,
  removeRoute: E.removeRoute,
  updateProduct: E.updateProduct,
  importPrice: E.importPrice,
  receiveOrder: E.receiveOrder,
  issueOrder: E.issueOrder,
  markUnclaimed: E.markUnclaimed,
  returnUnclaimed: E.returnUnclaimed,
  extendStorage: E.extendStorage,
  attachStaff: E.attachStaff,
  resolveDispute: E.resolveDispute,
  /** Вход по телефону: незнакомый номер регистрируется как покупатель */
  loginByPhone: (db: DB, phone: string) => {
    const digits = phone.replace(/\D/g, "").replace(/^8/, "7");
    let u = db.users.find((x) => x.phone === digits);
    if (!u) {
      u = { id: E.nextId(db, "u"), role: "buyer", name: "Новый покупатель", phone: digits };
      db.users.push(u);
    }
    return u;
  },
  renameUser: (db: DB, userId: string, name: string) => {
    const u = db.users.find((x) => x.id === userId);
    if (u) u.name = name.trim() || u.name;
  },
  markRead: (db: DB, userId: string, id?: string) => {
    for (const n of db.notifications) if (n.userId === userId && (!id || n.id === id)) n.read = true;
  },
  toggleStore: (db: DB, id: string) => {
    const s = db.stores.find((x) => x.id === id);
    if (s) s.active = !s.active;
  },
  toggleDistributor: (db: DB, id: string) => {
    const d = db.distributors.find((x) => x.id === id);
    if (d) d.active = !d.active;
  },
  updateStore: (db: DB, id: string, patch: Partial<DB["stores"][number]>) => {
    const s = db.stores.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
  },
};

export type Actions = typeof actions;
export type ActionName = keyof Actions;
type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never;
export type ActionArgs<K extends ActionName> = Tail<Parameters<Actions[K]>>;
export type ActionResult<K extends ActionName> = ReturnType<Actions[K]>;

/** Вход через бэкенд (Supabase). У локального источника его нет — сессия хранится в браузере. */
export interface AuthAdapter {
  userId(): string | null;
  subscribe(cb: () => void): () => void;
  /** демо-ключ («u-anna») → id пользователя в этом источнике */
  resolve(key: string): string;
  signInAs(key: string): Promise<void>;
  signInPhone(phone: string): Promise<User>;
  signOut(): Promise<void>;
}

export interface DataSource {
  /** Текущий снимок данных; null — ещё не загружено */
  getSnapshot(): DB | null;
  subscribe(cb: () => void): () => void;
  run<K extends ActionName>(name: K, ...args: ActionArgs<K>): Promise<ActionResult<K>>;
  reset(): Promise<void>;
  auth?: AuthAdapter;
}
