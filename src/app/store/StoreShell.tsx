"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, BarChart3, PackageCheck, ScanLine } from "lucide-react";
import { Bell } from "@/components/Bell";
import { DemoSwitch } from "@/components/DemoSwitch";
import { LogoMark } from "@/components/Logo";
import { byId } from "@/lib/engine";
import { today } from "@/lib/dates";
import { useApp } from "@/lib/data/provider";
import styles from "./store.module.css";

export function StoreShell({ children }: { children: React.ReactNode }) {
  const { db, user } = useApp();
  const path = usePathname();
  const store = byId(db.stores, user.storeId)!;
  const mine = db.orders.filter((o) => o.storeId === store.id);
  const incoming = mine.filter((o) => o.status === "in_transit").length;
  const expired = mine.filter((o) => o.status === "at_store" && (o.storedUntil ?? "9") < today()).length;

  const tabs = [
    { href: "/store", label: "Выдача", icon: ScanLine, exact: true },
    { href: "/store/incoming", label: "Приёмка", icon: PackageCheck, badge: incoming },
    { href: "/store/shelf", label: "Полка", icon: Archive, badge: expired, warn: true },
    { href: "/store/report", label: "Отчёт", icon: BarChart3 },
  ];

  return (
    <div className={styles.app}>
      <header className={styles.top}>
        <div className={styles.topInner}>
          <LogoMark size={30} />
          <div className="grow" style={{ minWidth: 0, lineHeight: 1.15 }}>
            <div className="kicker" style={{ color: "rgba(255,255,255,.6)", fontSize: 10 }}>
              Пункт выдачи · {user.name}
            </div>
            <b className="ellipsis" style={{ display: "block", fontSize: 16 }}>
              {store.name}, {store.address}
            </b>
          </div>
          <DemoSwitch tone="dark" />
          <Bell tone="dark" />
        </div>
        <nav className={styles.tabs}>
          {tabs.map((t) => {
            const on = t.exact ? path === t.href : path.startsWith(t.href);
            const Icon = t.icon;
            return (
              <Link key={t.href} href={t.href} className={styles.tab} aria-current={on ? "page" : undefined}>
                <Icon size={18} />
                {t.label}
                {t.badge ? <span className={t.warn ? styles.warnBadge : styles.badge}>{t.badge}</span> : null}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
