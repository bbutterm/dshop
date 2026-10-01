"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Home, LayoutGrid, Package, ShoppingBag, User } from "lucide-react";
import { Bell } from "@/components/Bell";
import { DemoSwitch } from "@/components/DemoSwitch";
import { LogoMark } from "@/components/Logo";
import { useApp } from "@/lib/data/provider";
import { buyerStore, cartCount } from "./lib";
import styles from "./buyer.module.css";

export function BuyerShell({ children }: { children: React.ReactNode }) {
  const { db, user } = useApp();
  const path = usePathname();
  const store = buyerStore(db, user);
  const count = cartCount(db, user);
  const active = db.orders.filter(
    (o) => o.buyerId === user.id && ["placed", "confirmed", "assembled", "in_transit", "at_store"].includes(o.status),
  ).length;

  const tabs = [
    { href: "/buyer", label: "Главная", icon: Home, exact: true },
    { href: "/buyer/catalog", label: "Каталог", icon: LayoutGrid },
    { href: "/buyer/cart", label: "Корзина", icon: ShoppingBag, badge: count },
    { href: "/buyer/orders", label: "Заказы", icon: Package, badge: active, soft: true },
    { href: "/buyer/profile", label: "Профиль", icon: User },
  ];

  return (
    <div className={styles.app}>
      <header className={styles.top}>
        <div className={styles.topInner}>
          <Link href="/buyer" aria-label="Главная">
            <LogoMark size={30} />
          </Link>
          <Link href="/buyer/stores" className={styles.storePick}>
            <span className="kicker">Забираю в</span>
            <span className={styles.storeName}>
              {store ? store.name : "Выберите магазин"} <ChevronDown size={14} />
            </span>
          </Link>
          <DemoSwitch />
          <Bell />
        </div>
      </header>

      <main className={styles.main}>{children}</main>

      <nav className={styles.tabs} aria-label="Разделы">
        <div className={styles.tabsInner}>
          {tabs.map((t) => {
            const on = t.exact ? path === t.href : path.startsWith(t.href);
            const Icon = t.icon;
            return (
              <Link key={t.href} href={t.href} className={styles.tab} aria-current={on ? "page" : undefined}>
                <span className={styles.tabIcon}>
                  <Icon size={21} strokeWidth={on ? 2.4 : 1.9} />
                  {t.badge ? <span className={t.soft ? styles.softBadge : "badge-dot"}>{t.badge}</span> : null}
                </span>
                <span>{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
