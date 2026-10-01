import { RoleGate } from "@/components/RoleGate";
import { StoreShell } from "./StoreShell";

export const metadata = { title: "Магазин" };

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate role="store">
      <StoreShell>{children}</StoreShell>
    </RoleGate>
  );
}
