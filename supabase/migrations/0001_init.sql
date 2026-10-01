-- «Закупка»: схема данных. Повторяет src/lib/types.ts (camelCase → snake_case).
-- Бизнес-операции над заказами — в 0002_rpc.sql; заказы клиент напрямую не пишет.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Типы
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('buyer', 'store', 'distributor', 'admin');

create type public.order_status as enum (
  'awaiting_payment',
  'placed',      -- оформлен и оплачен
  'confirmed',   -- подтверждён дистрибьютором по позициям
  'assembled',   -- собран и промаркирован
  'in_transit',  -- в пути с поставкой
  'at_store',    -- принят магазином, лежит на полке
  'issued',      -- выдан
  'unclaimed',   -- срок хранения истёк, невыкуп
  'returned',    -- невыкуп забран дистрибьютором
  'cancelled'
);

-- ---------------------------------------------------------------------------
-- Справочники
-- ---------------------------------------------------------------------------

create table public.stores (
  id            text primary key default gen_random_uuid()::text,
  name          text not null,
  address       text not null default '',
  district      text not null default '',
  hours         text not null default '',
  x             smallint not null default 50 check (x between 0 and 100),
  y             smallint not null default 50 check (y between 0 and 100),
  capacity      integer not null default 16 check (capacity >= 0),
  storage_days  smallint not null default 3 check (storage_days >= 0),
  pickup_fee    numeric(10,2) not null default 25 check (pickup_fee >= 0),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.distributors (
  id             text primary key default gen_random_uuid()::text,
  name           text not null,
  short          text not null,
  about          text not null default '',
  color          text not null default '#666666',
  inn            text not null default '',
  has_acquiring  boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Пользователь = auth.users + профиль с ролью
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  role               public.user_role not null default 'buyer',
  name               text not null default 'Новый покупатель',
  phone              text unique,  -- только цифры, как в auth.users.phone: 79101234567
  store_id           text references public.stores (id) on delete set null,
  distributor_id     text references public.distributors (id) on delete set null,
  favorite_store_id  text references public.stores (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint profiles_store_staff check (role <> 'store' or store_id is not null),
  constraint profiles_distributor_manager check (role <> 'distributor' or distributor_id is not null)
);
create index profiles_store_idx on public.profiles (store_id) where store_id is not null;
create index profiles_distributor_idx on public.profiles (distributor_id) where distributor_id is not null;
create index profiles_role_idx on public.profiles (role);

-- Какой дистрибьютор в какой магазин и по каким дням возит
create table public.routes (
  id              text primary key default gen_random_uuid()::text,
  distributor_id  text not null references public.distributors (id) on delete cascade,
  store_id        text not null references public.stores (id) on delete cascade,
  weekdays        smallint[] not null default '{}' check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),  -- 1..7 = пн..вс
  cutoff_hour     smallint not null default 18 check (cutoff_hour between 0 and 24),
  min_order       numeric(12,2) not null default 0 check (min_order >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (distributor_id, store_id)
);
create index routes_store_idx on public.routes (store_id);

create table public.products (
  id              text primary key default gen_random_uuid()::text,
  distributor_id  text not null references public.distributors (id) on delete cascade,
  sku             text not null,
  name            text not null,
  brand           text not null default '',
  category        text not null default 'Разное',
  unit            text not null default 'шт' check (unit in ('шт', 'уп', 'кор', 'бут', 'пач')),
  pack            integer not null default 1 check (pack > 0),
  weight          text not null default '',
  price           numeric(12,2) not null check (price >= 0),
  shelf_price     numeric(12,2) not null check (shelf_price >= 0),
  stock           integer not null default 0 check (stock >= 0),
  art             text not null default 'box' check (art in ('bag', 'box', 'bar', 'jar', 'bottle', 'can', 'pack', 'tin')),
  tint            text not null default '#888888',
  promo           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (distributor_id, sku)
);
create index products_catalog_idx on public.products (distributor_id, category) where active;

-- ---------------------------------------------------------------------------
-- Заказы
-- ---------------------------------------------------------------------------

create table public.trips (
  id              text primary key default gen_random_uuid()::text,
  distributor_id  text not null references public.distributors (id) on delete cascade,
  date            date not null,
  store_ids       text[] not null default '{}',
  driver          text not null default '',
  vehicle         text not null default '',
  status          text not null default 'planned' check (status in ('planned', 'loading', 'on_road', 'done')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index trips_distributor_date_idx on public.trips (distributor_id, date desc);
create index trips_store_ids_idx on public.trips using gin (store_ids);

create sequence public.order_number_seq start 1001;

create table public.orders (
  id                text primary key default gen_random_uuid()::text,
  number            integer not null unique default nextval('public.order_number_seq'),
  buyer_id          uuid not null references public.profiles (id) on delete restrict,
  distributor_id    text not null references public.distributors (id) on delete restrict,
  store_id          text not null references public.stores (id) on delete restrict,
  delivery_date     date not null,
  status            public.order_status not null default 'awaiting_payment',
  total             numeric(12,2) not null default 0 check (total >= 0),
  refund            numeric(12,2) not null default 0 check (refund >= 0),
  pickup_code       text not null default lpad((floor(random() * 900000) + 100000)::int::text, 6, '0'),
  label             text not null,  -- маркировка на пакете: «DP-1042»
  trip_id           text references public.trips (id) on delete set null,
  shelf_slot        text,
  stored_until      date,
  payment_method    text not null default 'card_link' check (payment_method in ('card_link', 'agent_cash')),
  paid_at           timestamptz,
  receipt_no        text,
  dispute_text      text,
  dispute_at        timestamptz,
  dispute_resolved  boolean,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter sequence public.order_number_seq owned by public.orders.number;
create index orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index orders_store_idx on public.orders (store_id, status);
create index orders_distributor_idx on public.orders (distributor_id, status, delivery_date);
create index orders_trip_idx on public.orders (trip_id) where trip_id is not null;
create index orders_pickup_idx on public.orders (store_id, pickup_code);
create index orders_open_dispute_idx on public.orders (dispute_at) where dispute_text is not null and not dispute_resolved;

-- Позиции: снимок названия и цены на момент заказа
create table public.order_items (
  order_id       text not null references public.orders (id) on delete cascade,
  product_id     text not null references public.products (id) on delete restrict,
  position       smallint not null default 0,
  name           text not null,
  unit           text not null,
  price          numeric(12,2) not null check (price >= 0),
  qty            integer not null check (qty > 0),
  confirmed_qty  integer check (confirmed_qty >= 0),  -- null — дистрибьютор ещё не подтверждал
  received_qty   integer check (received_qty >= 0),   -- сколько реально приехало
  primary key (order_id, product_id)
);
create index order_items_product_idx on public.order_items (product_id);

-- История заказа (Order.history)
create table public.order_events (
  id        bigint generated always as identity primary key,
  order_id  text not null references public.orders (id) on delete cascade,
  at        timestamptz not null default now(),
  status    text not null check (status in ('awaiting_payment', 'placed', 'confirmed', 'assembled', 'in_transit',
                                            'at_store', 'issued', 'unclaimed', 'returned', 'cancelled', 'note')),
  text      text not null,
  by_role   text not null check (by_role in ('buyer', 'store', 'distributor', 'admin', 'system')),
  actor_id  uuid references public.profiles (id) on delete set null
);
create index order_events_order_idx on public.order_events (order_id, id);

create table public.notifications (
  id       text primary key default gen_random_uuid()::text,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  at       timestamptz not null default now(),
  title    text not null,
  body     text not null default '',
  href     text,
  read     boolean not null default false,
  tone     text not null default 'info' check (tone in ('info', 'good', 'warn'))
);
create index notifications_user_idx on public.notifications (user_id, at desc);
create index notifications_unread_idx on public.notifications (user_id) where not read;

-- Корзины: строка на товар; distributor_id проставляется триггером из товара.
-- Все строки покупателя относятся к одному магазину (Cart.storeId) — синхронизирует триггер.
create table public.cart_lines (
  buyer_id        uuid not null references public.profiles (id) on delete cascade,
  store_id        text not null references public.stores (id) on delete cascade,
  distributor_id  text not null references public.distributors (id) on delete cascade,
  product_id      text not null references public.products (id) on delete cascade,
  qty             integer not null check (qty > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (buyer_id, product_id)
);
create index cart_lines_buyer_dist_idx on public.cart_lines (buyer_id, distributor_id);

-- ---------------------------------------------------------------------------
-- Триггеры
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['stores', 'distributors', 'profiles', 'routes', 'products', 'trips', 'orders', 'cart_lines'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end $$;

-- Новый пользователь из auth (вход по телефону) → профиль покупателя
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, name, role)
  values (new.id,
          nullif(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), ''),
          coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), 'Новый покупатель'),
          'buyer')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Корзина: дистрибьютор берётся из товара, кол-во ограничено остатком,
-- а смена магазина переносит всю корзину покупателя (как cart.storeId в engine.cartSet)
create or replace function public.cart_lines_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.products;
begin
  select * into p from public.products where id = new.product_id;
  if not found then raise exception 'Товар не найден' using errcode = 'P0001'; end if;
  new.distributor_id := p.distributor_id;
  -- остаток проверяем, только когда меняется количество (не при переносе корзины в другой магазин)
  if tg_op = 'UPDATE' and new.qty = old.qty then
    return new;
  end if;
  new.qty := least(new.qty, p.stock);
  if new.qty <= 0 then
    raise exception '«%»: нет на складе', p.name using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger cart_lines_before
  before insert or update on public.cart_lines
  for each row execute function public.cart_lines_before();

create or replace function public.cart_lines_sync_store() returns trigger
language plpgsql as $$
begin
  update public.cart_lines
     set store_id = new.store_id
   where buyer_id = new.buyer_id and store_id <> new.store_id;
  return null;
end $$;

create trigger cart_lines_sync_store
  after insert or update of store_id on public.cart_lines
  for each row execute function public.cart_lines_sync_store();

-- ---------------------------------------------------------------------------
-- Хелперы для RLS: читают профиль текущего пользователя в обход RLS
-- ---------------------------------------------------------------------------

create or replace function public.auth_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.auth_store_id() returns text
language sql stable security definer set search_path = public as $$
  select store_id from public.profiles where id = auth.uid() and role = 'store'
$$;

create or replace function public.auth_distributor_id() returns text
language sql stable security definer set search_path = public as $$
  select distributor_id from public.profiles where id = auth.uid() and role = 'distributor'
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- Пользователь сам меняет только имя и любимый магазин; роль и привязки — только админ
create or replace function public.profiles_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.role is distinct from old.role
    or new.store_id is distinct from old.store_id
    or new.distributor_id is distinct from old.distributor_id
    or new.phone is distinct from old.phone
    or new.id is distinct from old.id) then
    raise exception 'Недостаточно прав для изменения профиля' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.stores        enable row level security;
alter table public.distributors  enable row level security;
alter table public.routes        enable row level security;
alter table public.products      enable row level security;
alter table public.trips         enable row level security;
alter table public.orders        enable row level security;
alter table public.order_items   enable row level security;
alter table public.order_events  enable row level security;
alter table public.notifications enable row level security;
alter table public.cart_lines    enable row level security;

-- profiles: свой профиль; админ — все; магазин/дистрибьютор — покупателей своих заказов
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.buyer_id = profiles.id
      and (o.store_id = public.auth_store_id() or o.distributor_id = public.auth_distributor_id())
  )
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Каталог: читают все вошедшие
create policy stores_read on public.stores for select to authenticated using (true);
create policy stores_admin on public.stores for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy distributors_read on public.distributors for select to authenticated using (true);
create policy distributors_admin on public.distributors for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy routes_read on public.routes for select to authenticated using (true);
create policy routes_distributor on public.routes for all to authenticated
  using (distributor_id = public.auth_distributor_id())
  with check (distributor_id = public.auth_distributor_id());
create policy routes_admin on public.routes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy products_read on public.products for select to authenticated using (
  active or distributor_id = public.auth_distributor_id() or public.is_admin()
);
create policy products_distributor on public.products for all to authenticated
  using (distributor_id = public.auth_distributor_id())
  with check (distributor_id = public.auth_distributor_id());
create policy products_admin on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Рейсы: свой дистрибьютор, магазины по маршруту рейса, админ. Пишет RPC.
create policy trips_select on public.trips for select to authenticated using (
  distributor_id = public.auth_distributor_id()
  or public.auth_store_id() = any (store_ids)
  or public.is_admin()
);
create policy trips_distributor_update on public.trips for update to authenticated
  using (distributor_id = public.auth_distributor_id())
  with check (distributor_id = public.auth_distributor_id());

-- Заказы: только чтение, все изменения — через RPC (security definer)
create policy orders_select on public.orders for select to authenticated using (
  buyer_id = auth.uid()
  or store_id = public.auth_store_id()
  or distributor_id = public.auth_distributor_id()
  or public.is_admin()
);

create policy order_items_select on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_items.order_id)  -- RLS orders применяется внутри
);

create policy order_events_select on public.order_events for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_events.order_id)
);

-- Уведомления: свои; клиент может только отметить прочитанным
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Корзина: полностью своя
create policy cart_lines_own on public.cart_lines for all to authenticated
  using (buyer_id = auth.uid()) with check (buyer_id = auth.uid());

-- Клиенту в уведомлениях разрешено менять только флаг read
revoke update on public.notifications from authenticated, anon;
grant update (read) on public.notifications to authenticated;
-- Заказы и рейсы пишутся только из RPC
revoke insert, update, delete on public.orders, public.order_items, public.order_events from authenticated, anon;
revoke insert, delete on public.trips from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.orders, public.notifications, public.order_events, public.products, public.cart_lines;
-- для DELETE-событий корзины нужен полный old-ряд (иначе придут только ключи)
alter table public.cart_lines replica identity full;
