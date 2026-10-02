"use client";

import { ArrowLeftRight, ExternalLink, LogOut, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useData } from "@/lib/data/provider";
import { ROLES } from "@/lib/roles";
import styles from "./DemoSwitch.module.css";

/** Переключатель ролей для показа: в демо один человек проходит весь путь заказа */
export function DemoSwitch({ tone = "light" }: { tone?: "light" | "dark" }) {
  const ctx = useData();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!ctx) return null;
  const current = ctx.user?.role;

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.trigger} data-tone={tone} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ArrowLeftRight size={15} />
        <span>Роль</span>
      </button>
      {open && (
        <div className={styles.panel}>
          <div className="kicker" style={{ padding: "12px 14px 6px" }}>Демо · войти как</div>
          {ROLES.map((r) => (
            <div key={r.role} className={styles.item} data-active={current === r.role}>
              <button
                className={styles.main}
                onClick={async () => {
                  setOpen(false);
                  if (await ctx.login(r.userId)) router.push(r.home);
                }}
              >
                <b>{r.label}</b>
                <span className="tiny muted">{r.who}</span>
              </button>
              <a
                className={styles.ext}
                href={`/login?as=${r.userId}`}
                target="_blank"
                rel="noreferrer"
                title="Открыть в новой вкладке — уведомления придут вживую"
              >
                <ExternalLink size={15} />
              </a>
            </div>
          ))}
          <a className={styles.script} href="/demo" target="_blank" rel="noreferrer">
            Сценарий показа по шагам <ExternalLink size={13} />
          </a>
          <div className={styles.foot}>
            <button
              className="btn btn--ghost btn--sm"
              onClick={async () => {
                setOpen(false);
                try {
                  await ctx.source.reset();
                  ctx.toast({ title: "Демо-данные сброшены", tone: "info" });
                } catch (e) {
                  ctx.toast({ title: e instanceof Error ? e.message : "Не удалось сбросить данные", tone: "error" });
                }
              }}
            >
              <RotateCcw size={14} /> Сбросить данные
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={async () => {
                await ctx.logout();
                router.push("/login");
              }}
            >
              <LogOut size={14} /> Выйти
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
