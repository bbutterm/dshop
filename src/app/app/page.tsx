"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loading } from "@/components/RoleGate";
import { useData } from "@/lib/data/provider";
import { roleMeta } from "@/lib/roles";

/** Точка входа установленного приложения: сразу в свой раздел или на вход */
export default function Launch() {
  const ctx = useData();
  const router = useRouter();
  useEffect(() => {
    if (!ctx?.db) return;
    router.replace(ctx.user ? roleMeta(ctx.user.role).home : "/login");
  }, [ctx, router]);
  return <Loading />;
}
