import { STATUS_LABEL } from "@/lib/engine";
import type { OrderStatus } from "@/lib/types";

const TONE: Record<OrderStatus, string> = {
  awaiting_payment: "chip--mustard",
  placed: "chip--blue",
  confirmed: "chip--blue",
  assembled: "chip--blue",
  in_transit: "chip--mustard",
  at_store: "chip--green",
  issued: "",
  unclaimed: "chip--tomato",
  returned: "",
  cancelled: "",
};

export function StatusChip({ status, label }: { status: OrderStatus; label?: string }) {
  return <span className={`chip ${TONE[status]}`}>{label ?? STATUS_LABEL[status]}</span>;
}
