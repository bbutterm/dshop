"use client";

import { Bell as BellIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/dates";
import { useAction, useApp } from "@/lib/data/provider";
import styles from "./Bell.module.css";

export function Bell({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { db, user } = useApp();
  const { run } = useAction();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mine = db.notifications.filter((n) => n.userId === user.id);
  const unread = mine.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        className={styles.btn}
        data-tone={tone}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Уведомления${unread ? `: ${unread} новых` : ""}`}
        aria-expanded={open}
      >
        <BellIcon size={20} />
        {unread > 0 && <span className="badge-dot">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className={styles.panel}>
          <div className="spread" style={{ padding: "14px 16px 8px" }}>
            <b>Уведомления</b>
            {unread > 0 && (
              <button className="btn btn--ghost btn--sm" onClick={() => run("markRead", user.id)}>
                Прочитать все
              </button>
            )}
          </div>
          <div className={styles.list}>
            {mine.length === 0 && <div className="muted small" style={{ padding: 16 }}>Пока тихо.</div>}
            {mine.slice(0, 30).map((n) => (
              <button
                key={n.id}
                className={styles.item}
                data-unread={!n.read}
                data-tone={n.tone}
                onClick={() => {
                  run("markRead", user.id, n.id);
                  setOpen(false);
                  if (n.href) router.push(n.href);
                }}
              >
                <span className={styles.dot} />
                <span className="grow">
                  <b>{n.title}</b>
                  <span className={styles.body}>{n.body}</span>
                  <span className="tiny faint">{timeAgo(n.at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
