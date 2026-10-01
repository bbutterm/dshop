import { createSeed, DB_VERSION } from "../seed";
import type { DB } from "../types";
import { actions, type ActionArgs, type ActionName, type ActionResult, type DataSource } from "./actions";

const KEY = "zakupka:db";
const CHANNEL = "zakupka";

/**
 * Демо-источник: вся база в localStorage, вкладки синхронизируются через BroadcastChannel.
 * Откройте покупателя, магазин и дистрибьютора в соседних вкладках — уведомления придут вживую.
 */
export class LocalDataSource implements DataSource {
  private db: DB | null = null;
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window === "undefined") return;
    this.db = this.load();
    this.channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL) : null;
    this.channel?.addEventListener("message", () => this.reload());
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) this.reload();
    });
  }

  private load(): DB {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DB;
        if (parsed.version === DB_VERSION) return parsed;
      }
    } catch {
      // повреждённые данные — пересоздаём
    }
    const fresh = createSeed();
    this.save(fresh);
    return fresh;
  }

  private save(db: DB) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      // приватный режим: работаем в памяти
    }
  }

  private reload() {
    this.db = this.load();
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  getSnapshot = () => this.db;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  async run<K extends ActionName>(name: K, ...args: ActionArgs<K>): Promise<ActionResult<K>> {
    // перечитываем перед записью: другая вкладка могла изменить данные
    const db = structuredClone(this.load());
    const fn = actions[name] as (db: DB, ...a: unknown[]) => ActionResult<K>;
    const result = fn(db, ...(args as unknown[]));
    this.db = db;
    this.save(db);
    this.emit();
    this.channel?.postMessage({ type: "changed", name });
    // имитация сети, чтобы интерфейс честно показывал состояние загрузки
    await new Promise((r) => setTimeout(r, 120));
    return structuredClone(result);
  }

  async reset() {
    const fresh = createSeed();
    this.save(fresh);
    this.db = fresh;
    this.emit();
    this.channel?.postMessage({ type: "reset" });
  }
}
