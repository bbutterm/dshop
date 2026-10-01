"use client";

import { usePathname } from "next/navigation";
import { BarChart3, ClipboardList, Gauge, MapPinned, PackageSearch, Truck } from "lucide-react";
import { CabinetShell } from "@/components/cabinet/CabinetShell";
import { byId } from "@/lib/engine";
import { useApp } from "@/lib/data/provider";

export function DistributorShell({ children }: { children: React.ReactNode }) {
  const { db, user } = useApp();
  const path = usePathname();
  const d = byId(db.distributors, user.distributorId)!;
  const mine = db.orders.filter((o) => o.distributorId === d.id);
  // печатная форма маркировки — без оболочки кабинета
  if (path.startsWith("/distributor/labels")) return <>{children}</>;
  return (
    <CabinetShell
      title={d.name}
      subtitle={user.name}
      accent={d.color}
      nav={[
        { href: "/distributor", label: "Сводка", icon: Gauge, exact: true },
        { href: "/distributor/orders", label: "Заказы", icon: ClipboardList, badge: mine.filter((o) => o.status === "placed").length },
        { href: "/distributor/assembly", label: "Сборка и рейсы", icon: Truck, badge: mine.filter((o) => o.status === "confirmed").length },
        { href: "/distributor/catalog", label: "Каталог и прайс", icon: PackageSearch },
        { href: "/distributor/routes", label: "Точки и график", icon: MapPinned },
        { href: "/distributor/report", label: "Отчёт", icon: BarChart3 },
      ]}
    >
      {children}
    </CabinetShell>
  );
}
