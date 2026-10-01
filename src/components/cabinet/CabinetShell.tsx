"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Bell } from "@/components/Bell";
import { DemoSwitch } from "@/components/DemoSwitch";
import { Logo } from "@/components/Logo";
import styles from "./cabinet.module.css";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  exact?: boolean;
}

/** Раскладка веб-кабинета: дистрибьютор и админка платформы */
export function CabinetShell({
  title,
  subtitle,
  nav,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  nav: NavItem[];
  accent: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  return (
    <div className={styles.app} style={{ ["--accent" as string]: accent }}>
      <aside className={styles.side}>
        <div className={styles.brand}>
          <Logo size={26} light />
        </div>
        <div className={styles.org}>
          <span className={styles.orgSw} />
          <div style={{ minWidth: 0 }}>
            <b className="ellipsis" style={{ display: "block" }}>
              {title}
            </b>
            <span className="tiny" style={{ opacity: 0.6 }}>
              {subtitle}
            </span>
          </div>
        </div>
        <nav className={styles.nav}>
          {nav.map((n) => {
            const on = n.exact ? path === n.href : path.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link key={n.href} href={n.href} className={styles.link} aria-current={on ? "page" : undefined}>
                <Icon size={18} />
                <span className="grow">{n.label}</span>
                {n.badge ? <span className={styles.badge}>{n.badge}</span> : null}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className={styles.body}>
        <header className={styles.top}>
          <div className={styles.mobileBrand}>
            <Logo size={24} />
          </div>
          <div className="grow" />
          <DemoSwitch />
          <Bell />
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className={styles.head}>
      <div className="stack" style={{ ["--gap" as string]: "4px" }}>
        <h1 className="h1">{title}</h1>
        {sub && <div className="small muted">{sub}</div>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "green" | "mustard" | "tomato" }) {
  return (
    <div className={styles.kpi} data-tone={tone}>
      <span className="kicker">{label}</span>
      <b>{value}</b>
      {hint && <span className="tiny muted">{hint}</span>}
    </div>
  );
}
