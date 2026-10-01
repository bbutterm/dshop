import { RoleGate } from "@/components/RoleGate";
import { DistributorShell } from "./DistributorShell";

export const metadata = { title: "Кабинет дистрибьютора" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate role="distributor">
      <DistributorShell>{children}</DistributorShell>
    </RoleGate>
  );
}
