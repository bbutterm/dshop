import { RoleGate } from "@/components/RoleGate";
import { AdminShell } from "./AdminShell";

export const metadata = { title: "Платформа" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate role="admin">
      <AdminShell>{children}</AdminShell>
    </RoleGate>
  );
}
