import { addDays, isoDate, today, weekday } from "./dates";
import type { Route } from "./types";

/**
 * Ближайшие даты привоза по маршруту. Заказ на завтра принимается до cutoffHour сегодня,
 * на сегодня — уже нельзя (машина собрана с утра).
 */
export function nextDeliveryDates(route: Route, count = 3, now: Date = new Date()): string[] {
  const out: string[] = [];
  const start = isoDate(now);
  for (let i = 1; i < 21 && out.length < count; i++) {
    const d = addDays(start, i);
    if (!route.weekdays.includes(weekday(d))) continue;
    if (i === 1 && now.getHours() >= route.cutoffHour) continue;
    out.push(d);
  }
  return out;
}

/** Последняя дата привоза строго до `before` — для исторических заказов в демо-данных */
export function prevDeliveryDate(route: Route, before: string = today()): string {
  for (let i = 1; i < 21; i++) {
    const d = addDays(before, -i);
    if (route.weekdays.includes(weekday(d))) return d;
  }
  return addDays(before, -1);
}
