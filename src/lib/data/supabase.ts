import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "../engine";
import { createSeed } from "../seed";
import type { DB, User } from "../types";
import type { ActionArgs, ActionName, ActionResult, AuthAdapter, DataSource } from "./actions";

/**
 * Источник данных на Supabase. Таблицы — в схеме `zakupka` (проект общий с другими приложениями),
 * клиент ходит только через RPC `public.zk_*`. Модель та же, что у локального источника:
 * снимок DB целиком (get_snapshot под RLS) + перечитывание по событиям Realtime.
 */

/** Демо-аккаунты: ключ из seed.ts → uuid профиля (= md5('zakupka:' || ключ), см. zakupka.uid) и email */
export const DEMO_ACCOUNTS: Record<string, { id: string; email: string }> = {
  "u-anna": { id: "09621e38-c4df-4fa4-eeeb-b3682f5aba99", email: "anna@zakupka.demo" },
  "u-tatiana": { id: "0ae6410f-85f9-5593-ac33-3dff2e2dd1b8", email: "tatiana@zakupka.demo" },
  "u-sergey": { id: "04fcf44f-3e89-88b2-81c6-969926f60009", email: "sergey@zakupka.demo" },
  "u-admin": { id: "688671fa-4eca-4602-ca59-c2aac69ecdb5", email: "admin@zakupka.demo" },
};
const DEMO_PASSWORD = "zakupka-demo-2026";

const EMPTY: DB = {
  version: 0,
  users: [],
  stores: [],
  distributors: [],
  routes: [],
  products: [],
  orders: [],
  trips: [],
  notifications: [],
  carts: [],
  seq: 0,
};

/** Команда → [имя RPC, параметры]. Порядок аргументов — как в src/lib/data/actions.ts */
type RpcMap = { [K in ActionName]?: (...a: ActionArgs<K>) => [string, Record<string, unknown>] };
const RPC: RpcMap = {
  setFavoriteStore: (_u, storeId) => ["zk_set_favorite_store", { p_store_id: storeId }],
  cartSet: (_b, storeId, productId, qty) => ["zk_cart_set", { p_store_id: storeId, p_product_id: productId, p_qty: qty }],
  placeOrder: (_b, distributorId, date) => ["zk_place_order", { p_distributor_id: distributorId, p_delivery_date: date }],
  payOrder: (id) => ["zk_pay_order", { p_order_id: id }],
  cancelOrder: (id, _by, reason = "") => ["zk_cancel_order", { p_order_id: id, p_reason: reason }],
  openDispute: (id, text) => ["zk_open_dispute", { p_order_id: id, p_text: text }],
  confirmOrder: (id, qty) => ["zk_confirm_order", { p_order_id: id, p_qty: qty }],
  assembleOrders: (ids) => ["zk_assemble_orders", { p_order_ids: ids }],
  dispatchTrip: (d, date, driver, vehicle) => ["zk_dispatch_trip", { p_distributor_id: d, p_date: date, p_driver: driver, p_vehicle: vehicle }],
  upsertRoute: (r) => ["zk_upsert_route", { p_route: r }],
  removeRoute: (id) => ["zk_remove_route", { p_id: id }],
  updateProduct: (id, patch) => ["zk_update_product", { p_id: id, p_patch: patch }],
  importPrice: (d, rows) => ["zk_import_price", { p_distributor_id: d, p_rows: rows }],
  receiveOrder: (id, received) => ["zk_receive_order", { p_order_id: id, p_received: received ?? null }],
  issueOrder: (id) => ["zk_issue_order", { p_order_id: id }],
  markUnclaimed: (id) => ["zk_mark_unclaimed", { p_order_id: id }],
  returnUnclaimed: (id) => ["zk_return_unclaimed", { p_order_id: id }],
  extendStorage: (id, days) => ["zk_extend_storage", { p_order_id: id, p_days: days }],
  attachStaff: (userId, storeId) => ["zk_attach_staff", { p_user_id: userId, p_store_id: storeId ?? null }],
  resolveDispute: (id, answer) => ["zk_resolve_dispute", { p_order_id: id, p_answer: answer }],
  markRead: (_u, id) => ["zk_mark_read", { p_id: id ?? null }],
  toggleStore: (id) => ["zk_toggle_store", { p_id: id }],
  toggleDistributor: (id) => ["zk_toggle_distributor", { p_id: id }],
  updateStore: (id, patch) => ["zk_update_store", { p_id: id, p_patch: patch }],
  renameUser: (_u, name) => ["zk_rename_user", { p_name: name }],
};

// Сессия на вкладку: у каждой вкладки свой ключ (supabase-js синхронизирует вкладки
// через BroadcastChannel с именем ключа — с разными ключами роли во вкладках не смешиваются).
// Последняя сессия копируется в localStorage, чтобы новая вкладка и установленное приложение помнили вход.
const LAST = "zakupka:auth:last";
function tabKey(): string {
  let id = sessionStorage.getItem("zakupka:tab");
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem("zakupka:tab", id);
  }
  return `zakupka:auth:${id}`;
}
function tabStorage(key: string) {
  return {
    getItem: (k: string) => sessionStorage.getItem(k) ?? (k === key ? localStorage.getItem(LAST) : null),
    setItem: (k: string, v: string) => {
      sessionStorage.setItem(k, v);
      if (k === key) localStorage.setItem(LAST, v);
    },
    removeItem: (k: string) => {
      sessionStorage.removeItem(k);
      if (k === key) localStorage.removeItem(LAST);
    },
  };
}

function toError(e: { message: string; code?: string } | null): Error {
  if (!e) return new Error("Пустой ответ сервера");
  if (e.code === "P0001" || e.code === "42501") return new DomainError(e.message);
  return new Error(e.message);
}

export class SupabaseDataSource implements DataSource {
  private sb: SupabaseClient;
  private db: DB | null = null;
  private uid: string | null = null;
  private listeners = new Set<() => void>();
  private authListeners = new Set<() => void>();
  private reloadTimer: ReturnType<typeof setTimeout> | undefined;
  private channel: ReturnType<SupabaseClient["channel"]> | null = null;
  private sessionTask: Promise<void> = Promise.resolve();

  constructor(url: string, key: string) {
    const storageKey = tabKey();
    this.sb = createClient(url, key, {
      auth: { storage: tabStorage(storageKey), storageKey, persistSession: true, autoRefreshToken: true },
    });
    this.sb.auth.onAuthStateChange((event, session) => {
      const next = session?.user.id ?? null;
      const changed = next !== this.uid;
      this.uid = next;
      if (changed || event === "INITIAL_SESSION") {
        this.authListeners.forEach((l) => l());
        // не держим лок авторизации внутри обработчика
        this.sessionTask = new Promise((resolve) => setTimeout(() => this.onSession().then(resolve, resolve), 0));
      }
    });
  }

  private async onSession() {
    this.channel?.unsubscribe();
    this.channel = null;
    if (!this.uid) {
      this.db = EMPTY;
      this.emit();
      return;
    }
    this.db = null;
    this.emit();
    await this.sb.rpc("zk_ensure_profile");
    await this.reload();
    this.listen();
  }

  /** Дождаться, пока после смены сессии подтянется снимок */
  private async settled() {
    await new Promise((r) => setTimeout(r, 0));
    await this.sessionTask;
  }

  private listen() {
    const ch = this.sb.channel(`zakupka:${this.uid}`);
    for (const table of ["orders", "order_events", "notifications", "products", "cart_lines", "routes", "trips"]) {
      ch.on("postgres_changes", { event: "*", schema: "zakupka", table }, () => this.scheduleReload());
    }
    ch.subscribe();
    this.channel = ch;
  }

  private scheduleReload() {
    clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => void this.reload(), 200);
  }

  private async reload() {
    if (!this.uid) return;
    const { data, error } = await this.sb.rpc("zk_get_snapshot");
    if (error) {
      console.error("zk_get_snapshot", error);
      return;
    }
    this.db = data as DB;
    this.emit();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  getSnapshot = () => this.db;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  async run<K extends ActionName>(name: K, ...args: ActionArgs<K>): Promise<ActionResult<K>> {
    if (name === "loginByPhone") {
      return (await this.auth.signInPhone(args[0] as string)) as ActionResult<K>;
    }
    const map = RPC[name] as ((...a: unknown[]) => [string, Record<string, unknown>]) | undefined;
    if (!map) throw new DomainError("Действие недоступно в режиме базы данных");
    const [fn, params] = map(...(args as unknown[]));
    const { data, error } = await this.sb.rpc(fn, params);
    if (error) throw toError(error);
    await this.reload();
    return data as ActionResult<K>;
  }

  async reset() {
    const { error } = await this.sb.rpc("zk_demo_load", { p_db: createSeed() });
    if (error) throw toError(error);
    await this.sb.rpc("zk_ensure_profile");
    await this.reload();
  }

  auth: AuthAdapter = {
    userId: () => this.uid,
    subscribe: (cb) => {
      this.authListeners.add(cb);
      return () => this.authListeners.delete(cb);
    },
    resolve: (key) => DEMO_ACCOUNTS[key]?.id ?? key,
    signInAs: async (key) => {
      const demo = DEMO_ACCOUNTS[key] ?? Object.values(DEMO_ACCOUNTS).find((a) => a.id === key);
      if (!demo) throw new DomainError("Вход под этим пользователем доступен только по телефону");
      if (this.uid === demo.id) return;
      const { error } = await this.sb.auth.signInWithPassword({ email: demo.email, password: DEMO_PASSWORD });
      if (error) throw new DomainError(`Не удалось войти: ${error.message}`);
      await this.settled();
    },
    signInPhone: async (phone) => {
      const digits = phone.replace(/\D/g, "").replace(/^8/, "7");
      // номер демо-аккаунта → входим в него; иначе регистрируем покупателя (СМС в демо — заглушка)
      const { data: demoEmail } = await this.sb.rpc("zk_demo_email_by_phone", { p_phone: digits });
      const email = (demoEmail as string | null) ?? `${digits}@phone.zakupka.demo`;
      const password = demoEmail ? DEMO_PASSWORD : `phone-${digits}-zakupka`;
      let res = await this.sb.auth.signInWithPassword({ email, password });
      if (res.error && !demoEmail) {
        const up = await this.sb.auth.signUp({ email, password, options: { data: { phone: digits, app: "zakupka" } } });
        if (up.error) throw new DomainError(`Регистрация не удалась: ${up.error.message}`);
        if (!up.data.session) throw new DomainError("Регистрация требует подтверждения почты — войдите под демо-аккаунтом");
        res = await this.sb.auth.signInWithPassword({ email, password });
      }
      if (res.error || !res.data.user) throw new DomainError("Не удалось войти по номеру");
      await this.settled();
      return this.db?.users.find((u) => u.id === this.uid) ?? (null as unknown as User);
    },
    signOut: async () => {
      await this.sb.auth.signOut();
      await this.settled();
    },
  };
}
