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
import { DEMO_ACCOUNTS, DEMO_PASSWORD_PUBLIC, SupabaseDataSource } from "./supabase";

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
  /** где живут данные: в браузере или в Supabase */
  backend: "local" | "supabase";
  db: DB | null;
  user: User | null;
  /** вход под демо-ключом («u-anna») или id пользователя */
  login(userId: string): Promise<User | null>;
  logout(): Promise<void>;
  /** вход по почте и паролю (демо-аккаунты) */
  loginEmail(email: string, password: string): Promise<User | null>;
  /** демо-ключ → id пользователя в текущем источнике */
  idOf(key: string): string;
  toasts: Toast[];
  toast(t: Omit<Toast, "id">): void;
  dismiss(id: string): void;
}

const DataCtx = createContext<Ctx | null>(null);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
/** ?local=1 — принудительно демо в браузере, даже если база настроена */
function wantsLocal() {
  try {
    const q = new URLSearchParams(window.location.search).get("local");
    if (q !== null) localStorage.setItem("zakupka:local", q === "0" ? "" : "1");
    return localStorage.getItem("zakupka:local") === "1";
  } catch {
    return false;
  }
}

let singleton: DataSource | null = null;
function getSource(): DataSource {
  if (!singleton) {
    singleton =
      SUPABASE_URL && SUPABASE_KEY && !wantsLocal()
        ? new SupabaseDataSource(SUPABASE_URL, SUPABASE_KEY)
        : new LocalDataSource();
  }
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
  const auth = source?.auth;
  const localId = useSyncExternalStore(noop, readSession, () => null);
  const authId = useSyncExternalStore(auth?.subscribe ?? noop, () => auth?.userId() ?? null, () => null);
  const [sessionUser, setSessionUser] = useState<string | null | undefined>(undefined);
  const effectiveId = auth ? authId : sessionUser === undefined ? localId : sessionUser;
  const user = db?.users.find((u) => u.id === effectiveId) ?? null;

  const toastRef = useRef<(t: Omit<Toast, "id">) => void>(() => {});
  const idOf = useCallback((key: string) => (auth ? auth.resolve(key) : key), [auth]);

  const login = useCallback(
    async (key: string): Promise<User | null> => {
      if (auth) {
        try {
          await auth.signInAs(key);
        } catch (e) {
          toastRef.current({ title: e instanceof Error ? e.message : "Не удалось войти", tone: "error" });
          return null;
        }
        const id = auth.resolve(key);
        return source?.getSnapshot()?.users.find((u) => u.id === id) ?? null;
      }
      try {
        sessionStorage.setItem(SESSION_KEY, key);
        localStorage.setItem(SESSION_KEY, key);
      } catch {}
      setSessionUser(key);
      return source?.getSnapshot()?.users.find((u) => u.id === key) ?? null;
    },
    [auth, source],
  );

  const loginEmail = useCallback(
    async (email: string, password: string): Promise<User | null> => {
      const mail = email.trim().toLowerCase();
      if (auth) {
        try {
          await auth.signInEmail(mail, password);
        } catch (e) {
          toastRef.current({ title: e instanceof Error ? e.message : "Не удалось войти", tone: "error" });
          return null;
        }
        const id = auth.userId();
        return source?.getSnapshot()?.users.find((u) => u.id === id) ?? null;
      }
      // демо в браузере: те же демо-аккаунты и пароль, что и в базе
      const key = Object.entries(DEMO_ACCOUNTS).find(([, a]) => a.email === mail)?.[0];
      if (!key || password !== DEMO_PASSWORD_PUBLIC) {
        toastRef.current({ title: "Неверная почта или пароль", tone: "error" });
        return null;
      }
      return login(key);
    },
    [auth, source, login],
  );

  const logout = useCallback(async () => {
    if (auth) return auth.signOut();
    try {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
    } catch {}
    setSessionUser(null);
  }, [auth]);

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

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

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
    () =>
      source
        ? { source, backend: auth ? "supabase" : "local", db, user, login, loginEmail, logout, idOf, toasts, toast, dismiss }
        : null,
    [source, auth, db, user, login, loginEmail, logout, idOf, toasts, toast, dismiss],
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
