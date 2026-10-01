"use client";

import { Activity, ClipboardList, Users } from "lucide-react";
import { CabinetShell } from "@/components/cabinet/CabinetShell";
import { useApp } from "@/lib/data/provider";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { db, user } = useApp();
  const disputes = db.orders.filter((o) => o.dispute && !o.dispute.resolved).length;
  return (
    <CabinetShell
      title="Платформа"
      subtitle={user.name}
      accent="#9fb6d1"
      nav={[
        { href: "/admin", label: "Пилот", icon: Activity, exact: true },
        { href: "/admin/participants", label: "Участники", icon: Users },
        { href: "/admin/orders", label: "Заказы и споры", icon: ClipboardList, badge: disputes },
      ]}
    >
      {children}
    </CabinetShell>
  );
}
