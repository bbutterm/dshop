import { DEMO } from "./seed";
import type { Role } from "./types";

export const ROLES: { role: Role; label: string; who: string; home: string; userId: string; hint: string }[] = [
  { role: "buyer", label: "Покупатель", who: "Анна, мама двоих детей", home: "/buyer", userId: DEMO.buyer, hint: "Собирает корзину, платит, забирает по коду" },
  { role: "store", label: "Магазин", who: "Татьяна Ивановна, «Ромашка»", home: "/store", userId: DEMO.store, hint: "Принимает поставку, хранит, выдаёт" },
  { role: "distributor", label: "Дистрибьютор", who: "Сергей, ТД «Деснапродукт»", home: "/distributor", userId: DEMO.distributor, hint: "Подтверждает, собирает, везёт" },
  { role: "admin", label: "Платформа", who: "Команда «Закупки»", home: "/admin", userId: DEMO.admin, hint: "Подключение участников, метрики, споры" },
];

export const roleMeta = (r: Role) => ROLES.find((x) => x.role === r)!;
