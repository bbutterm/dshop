import { byId } from "@/lib/engine";
import type { DB, User } from "@/lib/types";

export function distOf(db: DB, user: User) {
  return byId(db.distributors, user.distributorId)!;
}

export function ordersOf(db: DB, user: User) {
  return db.orders.filter((o) => o.distributorId === user.distributorId);
}
