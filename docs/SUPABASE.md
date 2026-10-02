# База данных: Supabase

Данные «Закупки» живут в проекте Supabase **Imgtexh** (`ajltzwomvyvntvtjnrrf`), который общий с другими приложениями. Поэтому всё изолировано:

- таблицы, типы и логика — только в схеме **`zakupka`**; в `public` нет ни одной нашей таблицы;
- приложение обращается к базе только через функции **`public.zk_*`** (тонкие обёртки над `zakupka.*`);
- никаких триггеров на `auth.users` и никаких изменений чужих прав: профиль создаётся при первом входе (`zk_ensure_profile`);
- в `auth.users` добавлены только 4 демо-аккаунта с почтой `@zakupka.demo`.

## Миграции (`supabase/migrations`)

| Файл | Что внутри | Статус |
|---|---|---|
| `0001_zakupka_schema.sql` | схема, таблицы, RLS, Realtime-публикация, права на чтение для `authenticated` | применена |
| `0002_zakupka_rpc.sql` | служебные функции, команды дистрибьютора, магазина и админки, `get_snapshot` | применена |
| `0003_zakupka_api.sql` | команды покупателя, корзина, каталог, график, загрузка демо-данных, публичные `zk_*` и права | **выполнить в SQL Editor** |
| `0004_zakupka_demo_accounts.sql` | демо-аккаунты | применена |

`0003` содержит `DELETE`/`TRUNCATE` внутри функций (очистка корзины, удаление маршрута, сброс демо-данных — только таблицы `zakupka`), поэтому инструмент Claude запросил подтверждение. Проще выполнить файл вручную: Supabase → SQL Editor → вставить содержимое → Run.

После этого — загрузить демо-данные: войти в приложение любым демо-аккаунтом → «Роль» → «Сбросить данные» (или «Начать заново» на `/demo`). Сид строится тем же `src/lib/seed.ts`, даты всегда относительно сегодняшнего дня.

## Как устроен клиент

- `src/lib/data/supabase.ts` — `SupabaseDataSource`: снимок всех данных одним вызовом `zk_get_snapshot` (под RLS каждый видит своё), команды → `supabase.rpc('zk_…')`, перечитывание по событиям Realtime на таблицах `zakupka`.
- Источник выбирается в `src/lib/data/provider.tsx`: есть `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Supabase, иначе демо в браузере. `?local=1` в адресе принудительно включает браузерный режим (`?local=0` — выключает).
- Сессия хранится на вкладку: покупатель, магазин и дистрибьютор открываются в соседних вкладках одного браузера.

## Демо-аккаунты

| Роль | Email | Пароль |
|---|---|---|
| Покупатель | anna@zakupka.demo | zakupka-demo-2026 |
| Магазин | tatiana@zakupka.demo | zakupka-demo-2026 |
| Дистрибьютор | sergey@zakupka.demo | zakupka-demo-2026 |
| Платформа | admin@zakupka.demo | zakupka-demo-2026 |

Кнопки «Войти как…» в приложении используют их сами. Вход по телефону: номер демо-аккаунта входит в него; новый номер регистрирует покупателя (`<номер>@phone.zakupka.demo`), если в проекте не требуется подтверждение почты.

## Удалить всё «Закупкино» из проекта

```sql
drop schema zakupka cascade;
do $$ declare f record; begin
  for f in select oid::regprocedure s from pg_proc where proname like 'zk\_%' and pronamespace = 'public'::regnamespace
  loop execute 'drop function ' || f.s; end loop; end $$;
delete from auth.users where email like '%@zakupka.demo';
```
