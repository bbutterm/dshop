"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { DomainError } from "../engine";
import type { DB, Notification, User } from "../types";
import type { ActionArgs, ActionName, ActionResult, DataSource } from "./actions";
import { LocalDataSource } from "./local";

const SESSION_KEY = "zakupka:user";

interface Toast {
  id: string;
  title: string;
  body?: string;
  tone: Notification["tone"] | "error";
  href?: string;
}

interface Ctx {
  source: DataSource;
  db: DB | null;
  user: User | null;
  login(userId: string): void;
  logout(): void;
  toasts: Toast[];
  toast(t: Omit<Toast, "id">): void;
  dismiss(id: string): void;
}

const DataCtx = createContext<Ctx | null>(null);

let singleton: DataSource | null = null;
function getSource(): DataSource {
  // Завтра здесь появится выбор: process.env.NEXT_PUBLIC_SUPABASE_URL ? new SupabaseDataSource() : …
  if (!singleton) singleton = new LocalDataSource();
  return singleton;
}

const noop = () => () => {};

function readSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  // На сервере и во время гидрации источника нет — так разметка совпадает, данные подтягиваются сразу после
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const source = hydrated ? getSource() : null;
  const db = useSyncExternalStore(
    source?.subscribe ?? noop,
    () => source?.getSnapshot() ?? null,
    () => null,
  );
  // сессия — на вкладку: в соседних вкладках можно держать разные роли
  const userId = useSyncExternalStore(noop, readSession, () => null);
  const [sessionUser, setSessionUser] = useState<string | null | undefined>(undefined);
  const effectiveId = sessionUser === undefined ? userId : sessionUser;
  const user = db?.users.find((u) => u.id === effectiveId) ?? null;

  const login = useCallback((id: string) => {
    try {
      sessionStorage.setItem(SESSION_KEY, id);
      localStorage.setItem(SESSION_KEY, id);
    } catch {}
    setSessionUser(id);
  }, []);

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
    } catch {}
    setSessionUser(null);
  }, []);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), 5200);
    },
    [dismiss],
  );

  // Новые уведомления текущего пользователя показываем тостом — в том числе пришедшие из другой вкладки
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!db || !user) return;
    const mine = db.notifications.filter((n) => n.userId === user.id);
    if (!seen.current) {
      seen.current = new Set(mine.map((n) => n.id));
      return;
    }
    const fresh = mine.filter((n) => !seen.current!.has(n.id));
    for (const n of fresh.reverse()) {
      seen.current.add(n.id);
      toast({ title: n.title, body: n.body, tone: n.tone, href: n.href });
    }
  }, [db, user, toast]);
  useEffect(() => {
    seen.current = null;
  }, [user?.id]);

  const value = useMemo<Ctx | null>(
    () => (source ? { source, db, user, login, logout, toasts, toast, dismiss } : null),
    [source, db, user, login, logout, toasts, toast, dismiss],
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): Ctx | null {
  return useContext(DataCtx);
}

/** Для экранов внутри ролевых раскладок: данные и пользователь гарантированно загружены */
export function useApp() {
  const ctx = useContext(DataCtx);
  if (!ctx || !ctx.db || !ctx.user) throw new Error("useApp вне загруженной раскладки");
  return ctx as Ctx & { db: DB; user: User };
}

/** Вызов команды с состоянием загрузки и показом ошибок */
export function useAction() {
  const ctx = useContext(DataCtx);
  const [pending, setPending] = useState<string | null>(null);
  const run = useCallback(
    async <K extends ActionName>(name: K, ...args: ActionArgs<K>): Promise<ActionResult<K> | undefined> => {
      if (!ctx) return undefined;
      setPending(name);
      try {
        return await ctx.source.run(name, ...args);
      } catch (e) {
        const msg = e instanceof DomainError ? e.message : "Что-то пошло не так. Попробуйте ещё раз.";
        ctx.toast({ title: msg, tone: "error" });
        if (!(e instanceof DomainError)) console.error(e);
        return undefined;
      } finally {
        setPending(null);
      }
    },
    [ctx],
  );
  return { run, pending };
}
