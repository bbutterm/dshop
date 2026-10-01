import { RoleGate } from "@/components/RoleGate";
import { BuyerShell } from "./BuyerShell";

export const metadata = { title: "Покупатель" };

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate role="buyer">
      <BuyerShell>{children}</BuyerShell>
    </RoleGate>
  );
}
