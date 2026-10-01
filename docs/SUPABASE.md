# Переезд на Supabase — план на завтра

Сейчас данные живут в `localStorage` (`src/lib/data/local.ts`). Всё остальное приложение работает через интерфейс `DataSource` (`src/lib/data/actions.ts`): `getSnapshot()`, `subscribe()`, `run(name, ...args)`, `reset()`. Задача: добавить `SupabaseDataSource` с тем же интерфейсом и переключить на него `getSource()`. Экраны не трогаем.

Что уже готово в репозитории:

| Файл | Что внутри |
|---|---|
| `supabase/migrations/0001_init.sql` | таблицы, enum-ы, индексы, триггеры `updated_at`, профиль при регистрации, RLS, publication `supabase_realtime` |
| `supabase/migrations/0002_rpc.sql` | RPC жизненного цикла заказа (копия правил `engine.ts`), `get_snapshot()`, права на функции |
| `supabase/seed.sql` | 4 магазина, 2 дистрибьютора, 5 маршрутов, 36 товаров; в комментарии — как выдать роли демо-пользователям |

Миграции проверены на чистом Postgres 16 (с заглушкой схемы `auth`): весь путь заказа от корзины до выдачи, отмены, невыкуп, права ролей.

## 1. Проект (≈15 мин)

1. Создать проект в Supabase, регион — Frankfurt (`eu-central-1`), ближе к Брянску.
2. Применить миграции по порядку: `0001_init.sql`, `0002_rpc.sql`, затем `seed.sql`.
   Через CLI: `supabase link --project-ref <ref> && supabase db push && psql "$DB_URL" -f supabase/seed.sql`, или вставить файлы в SQL Editor.
3. Auth → Providers → Phone: включить. Для демо без SMS-провайдера завести тестовые номера (Test phone numbers) с кодом `123456` — список в шапке `seed.sql`.
4. Войти каждым демо-номером один раз (появятся профили покупателей), затем выполнить `update profiles ...` из `seed.sql`, чтобы выдать роли.
5. Проверить: Database → Publications → `supabase_realtime` содержит `orders, notifications, order_events, products, cart_lines`.

## 2. Переменные окружения

`.env.local` (и то же в Vercel):

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
```

`service_role` в клиент не попадает никогда.

## 3. `SupabaseDataSource` (`src/lib/data/supabase.ts`)

`npm i @supabase/supabase-js`

- **Снимок.** `getSnapshot()` отдаёт кэш `DB | null`. Загрузка — одним вызовом `supabase.rpc("get_snapshot")`: функция возвращает объект ровно в форме `DB` из `types.ts` (camelCase, без `null`-полей) и работает под RLS, так что каждый видит только своё.
- **Живые обновления.** Один канал `supabase.channel("db").on("postgres_changes", { event: "*", schema: "public", table: <t> }, …)` на `orders`, `order_events`, `notifications`, `products`, `cart_lines`. На любое событие — перечитать снимок с задержкой ~150 мс (debounce), затем уведомить подписчиков. Точечные патчи кэша — потом, если понадобится.
- **Команды.** `run(name, ...args)`: если команда есть в таблице ниже как RPC — `supabase.rpc(rpcName, toParams(...args))`; если клиентская — запрос к таблице. После успеха — перечитать снимок (не дожидаясь realtime) и вернуть результат.
- **Ошибки.** RPC бросают `P0001` с русским текстом для пользователя → `throw new DomainError(error.message)`; тогда `useAction()` покажет его тостом. Код `42501` — «нет доступа», тоже можно отдать как `DomainError`.
- **`reset()`** в Supabase не поддерживаем: бросить `DomainError("Сброс доступен только в демо-режиме")` и спрятать кнопку, когда источник — Supabase.
- RPC принимают **именованные** параметры, поэтому нужна маленькая таблица соответствия «позиционные аргументы → `{ p_... }`»:

```ts
const RPC = {
  placeOrder: (_buyerId: string, distributorId: string, date: string) =>
    ["place_order", { p_distributor_id: distributorId, p_delivery_date: date }],
  payOrder: (orderId: string) => ["pay_order", { p_order_id: orderId }],
  cancelOrder: (orderId: string, by: Role, reason = "") =>
    ["cancel_order", { p_order_id: orderId, p_by: by, p_reason: reason }],
  confirmOrder: (orderId: string, qty: Record<string, number>) =>
    ["confirm_order", { p_order_id: orderId, p_qty: qty }],
  // …остальные по таблице ниже
} satisfies Partial<Record<ActionName, (...a: any[]) => [string, object]>>;
```

## 4. Где переключать

`src/lib/data/provider.tsx`, функция `getSource()`:

```ts
if (!singleton)
  singleton = process.env.NEXT_PUBLIC_SUPABASE_URL ? new SupabaseDataSource() : new LocalDataSource();
```

Без переменных окружения приложение остаётся демо на `localStorage` — удобно для показа офлайн.

## 5. Вход по телефону вместо демо-входа

- `src/app/login/LoginForm.tsx`: вместо `run("loginByPhone", phone)` — `supabase.auth.signInWithOtp({ phone: "+7…" })`, второй шаг — поле кода и `supabase.auth.verifyOtp({ phone, token, type: "sms" })`.
- В `provider.tsx` текущий пользователь берётся не из `sessionStorage`, а из `supabase.auth.getSession()` + `onAuthStateChange`; `user = db.users.find(u => u.id === session.user.id)`. `login(id)` не нужен, `logout()` → `supabase.auth.signOut()`. При смене сессии — перечитать снимок.
- Быстрые кнопки ролей (`src/lib/roles.ts`, `DEMO.*` = `u-anna` …) в Supabase-режиме не работают: id теперь uuid из `auth.users`. Заменить на подсказку с тестовыми номерами.
- «Разные роли в соседних вкладках» пропадёт: сессия Supabase общая на браузер. Для демо — разные браузеры или окно инкогнито.

## 6. Команды: имя → RPC → кто может вызвать

Админ (`admin`) проходит любую проверку роли. «Свой» = заказ своего покупателя / своего магазина (`profiles.store_id`) / своего дистрибьютора (`profiles.distributor_id`).

| Действие (`actions.ts`) | RPC | Роль | Допустимый статус |
|---|---|---|---|
| `placeOrder` | `place_order(p_distributor_id, p_delivery_date)` | buyer (покупатель = `auth.uid()`) | — создаёт `awaiting_payment` |
| `payOrder` | `pay_order(p_order_id)` — заглушка эквайринга | buyer, свой | `awaiting_payment` → `placed` |
| `cancelOrder` | `cancel_order(p_order_id, p_by, p_reason)` | buyer или distributor, свой; `p_by` игнорируется, роль берётся из профиля | `awaiting_payment`, `placed` → `cancelled` |
| `openDispute` | `open_dispute(p_order_id, p_text)` | buyer, свой | любой |
| `confirmOrder` | `confirm_order(p_order_id, p_qty jsonb)` | distributor, свой | `placed` → `confirmed` (или `cancelled`, если всё по нулям) |
| `assembleOrders` | `assemble_orders(p_order_ids text[])` | distributor, свои | `confirmed` → `assembled` |
| `dispatchTrip` | `dispatch_trip(p_distributor_id, p_date, p_driver, p_vehicle)` → `Trip` | distributor своего `p_distributor_id` | `assembled` → `in_transit`; невыкуп в магазинах рейса `unclaimed` → `returned` |
| `returnUnclaimed` | `return_unclaimed(p_order_id)` | distributor, свой | `unclaimed` → `returned` |
| `importPrice` | `import_price(p_distributor_id, p_rows jsonb)` → `{updated, added}` | distributor своего | — |
| `receiveOrder` | `receive_order(p_order_id, p_received jsonb \| null)` | store, свой магазин | `in_transit` → `at_store` |
| `issueOrder` | `issue_order(p_order_id)` | store, свой | `at_store` → `issued` |
| `markUnclaimed` | `mark_unclaimed(p_order_id)` | store, свой | `at_store` → `unclaimed` |
| `extendStorage` | `extend_storage(p_order_id, p_days)` | store, свой | `at_store` (запись `note`) |
| `resolveDispute` | `resolve_dispute(p_order_id, p_answer)` | admin | любой |
| `attachStaff` | `attach_staff(p_user_id, p_store_id \| null)` | admin | — |

Каждая RPC пишет историю в `order_events` и уведомления нужным людям в `notifications` — их подхватит realtime. `placeOrder`/`payOrder`/`dispatchTrip` возвращают объект (заказ/рейс) в той же форме, что `engine.ts`.

## 7. Что остаётся на клиенте (прямые запросы, защищены RLS)

| Действие | Запрос |
|---|---|
| `cartSet(buyerId, storeId, productId, qty)` | `qty > 0`: `from("cart_lines").upsert({ buyer_id, store_id, product_id, qty }, { onConflict: "buyer_id,product_id" })`; `qty = 0`: `delete().match({ buyer_id, product_id })`. `distributor_id` и ограничение по остатку проставляет триггер; смена `store_id` переносит всю корзину покупателя. |
| `setFavoriteStore(userId, storeId)` | `profiles.update({ favorite_store_id })` + `cart_lines.update({ store_id }).eq("buyer_id", userId)` |
| `markRead(userId, id?)` | `notifications.update({ read: true }).eq("user_id", userId)` (+ `.eq("id", id)`); клиенту разрешено менять только колонку `read` |
| `renameUser(userId, name)` | `profiles.update({ name })` — роль/привязки сам пользователь сменить не может (триггер `profiles_guard`) |
| `upsertRoute` / `removeRoute` | `routes.upsert(...)` / `routes.delete()` — дистрибьютор только свои |
| `updateProduct(id, patch)` | `products.update(snakeCase(patch))` — дистрибьютор только свои |
| `toggleStore`, `updateStore`, `toggleDistributor` | `stores` / `distributors` `.update(...)` — только admin |
| `loginByPhone` | заменяется на OTP (раздел 5) |

Нужен хелпер `snakeCase(patch)` для объектов `Partial<Product>`, `Partial<Route>`, `Partial<Store>` (`shelfPrice → shelf_price`, `cutoffHour → cutoff_hour`, `minOrder → min_order`, `storageDays → storage_days`, `pickupFee → pickup_fee`, `distributorId → distributor_id`, `storeId → store_id`).

## 8. Порядок работы и проверка

1. Миграции + seed + роли (раздел 1) — 20 мин.
2. `supabase.ts` с `get_snapshot` и realtime, переключатель в `getSource()` — 1 ч.
3. Таблицы RPC и клиентских команд — 1 ч.
4. OTP-вход и сессия в `provider.tsx` — 1 ч.
5. Прогон: Анна собирает корзину → оформляет → платит; Сергей подтверждает частично → собирает → отправляет рейс; Татьяна принимает с недовозом → выдаёт по коду. В трёх браузерах уведомления должны приходить вживую.
6. Supabase → Advisors (Security и Performance): убедиться, что нет таблиц без RLS.

## Известные расхождения и долги

- Даты привоза на сервере считаются по `Europe/Moscow`, на клиенте (`delivery.ts`) — по времени браузера. Для Брянска совпадает.
- В `engine.confirmOrder` при полном отказе остаток возвращается на склад дважды; в `confirm_order` это исправлено.
- `pickup_code` виден сотруднику магазина через RLS (нужен для поиска по коду). Если это лишнее — вынести поиск в RPC и закрыть колонку.
- `pay_order` — заглушка: в проде статус `placed` должен ставить вебхук эквайринга под `service_role`, а клиенту `pay_order` закрыть.
- Исторических демо-заказов (метрики пилота из `createSeed()`) в `seed.sql` нет: они привязаны к демо-пользователям, которых в Supabase создаёт вход по телефону.
