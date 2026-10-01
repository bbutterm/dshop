"use client";

import Link from "next/link";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { useData } from "@/lib/data/provider";
import styles from "./Toaster.module.css";

const ICON = { info: Info, good: Check, warn: AlertTriangle, error: AlertTriangle };

export function Toaster() {
  const ctx = useData();
  if (!ctx) return null;
  return (
    <div className={styles.wrap} aria-live="polite">
      {ctx.toasts.map((t) => {
        const Icon = ICON[t.tone];
        const body = (
          <>
            <span className={styles.icon} data-tone={t.tone}>
              <Icon size={16} strokeWidth={2.4} />
            </span>
            <span className="grow">
              <b>{t.title}</b>
              {t.body && <span className={styles.body}>{t.body}</span>}
            </span>
          </>
        );
        return (
          <div key={t.id} className={styles.toast} data-tone={t.tone}>
            {t.href ? (
              <Link href={t.href} className={styles.inner} onClick={() => ctx.dismiss(t.id)}>
                {body}
              </Link>
            ) : (
              <div className={styles.inner}>{body}</div>
            )}
            <button className={styles.close} onClick={() => ctx.dismiss(t.id)} aria-label="Закрыть">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
