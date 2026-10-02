"use client";

import { ArrowRight, ArrowUpRight, ShieldCheck, ShoppingBasket, Store, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data/provider";
import { ROLES } from "@/lib/roles";
import styles from "./RoleEntry.module.css";

const ICONS = { buyer: ShoppingBasket, store: Store, distributor: Truck, admin: ShieldCheck };

export function RoleEntry() {
  const ctx = useData();
  const router = useRouter();
  return (
    <div className={styles.grid}>
      {ROLES.map((r, i) => {
        const Icon = ICONS[r.role];
        return (
          <div key={r.role} className={styles.card} data-role={r.role}>
            <button
              className={styles.main}
              onClick={async () => {
                if (await ctx?.login(r.userId)) router.push(r.home);
              }}
            >
              <span className={styles.icon}>
                <Icon size={22} strokeWidth={2} />
              </span>
              <span className="mono tiny muted">
                0{i + 1}
              </span>
              <b className={styles.role}>{r.label}</b>
              <span className={styles.who}>{r.who}</span>
              <span className={styles.hint}>{r.hint}</span>
              <span className={styles.go}>
                Войти <ArrowRight size={16} />
              </span>
            </button>
            <a className={styles.ext} href={`/login?as=${r.userId}`} target="_blank" rel="noreferrer" title="В новой вкладке">
              <ArrowUpRight size={16} />
            </a>
          </div>
        );
      })}
    </div>
  );
}
