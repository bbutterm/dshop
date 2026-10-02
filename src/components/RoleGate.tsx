"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useData } from "@/lib/data/provider";
import { roleMeta } from "@/lib/roles";
import type { Role } from "@/lib/types";

/** Пускает в раздел только нужную роль; пока данные грузятся — показывает каркас */
export function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const ctx = useData();
  const router = useRouter();
  const path = usePathname();
  const ready = !!ctx?.db;
  const user = ctx?.user;

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [ready, user, router, path]);

  if (!ready || !user) return <Loading />;
  if (user.role !== role) {
    const mine = roleMeta(user.role);
    const need = roleMeta(role);
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
        <div className="card stack" style={{ maxWidth: 420, ["--pad" as string]: "24px" }}>
          <div className="kicker">Нет доступа</div>
          <div className="h2">Этот раздел — для роли «{need.label}»</div>
          <p className="muted">
            Вы вошли как {user.name} ({mine.label.toLowerCase()}). В демо можно переключиться на нужную роль.
          </p>
          <div className="row wrap">
            <button
              className="btn btn--primary"
              onClick={() => ctx!.login(need.userId)}
            >
              Войти как {need.label.toLowerCase()}
            </button>
            <Link className="btn" href={mine.home}>
              Мой раздел
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function Loading() {
  return (
    <div style={{ padding: 20, display: "grid", gap: 12, maxWidth: 560, margin: "40px auto" }} aria-busy="true">
      <div className="skeleton" style={{ height: 28, width: "40%" }} />
      <div className="skeleton" style={{ height: 120 }} />
      <div className="skeleton" style={{ height: 120 }} />
    </div>
  );
}
