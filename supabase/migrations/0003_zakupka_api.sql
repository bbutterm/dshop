-- «Закупка»: команды покупателя, профиль, корзина, каталог, админка, демо-данные
-- и публичный API public.zk_* — единственная точка входа для клиента.
--
-- Этот файл содержит DELETE/TRUNCATE внутри функций (очистка корзины, удаление маршрута,
-- сброс демо-данных) — все они касаются только таблиц схемы zakupka.
-- Применяется в SQL Editor Supabase целиком: Run.

-- ---------------------------------------------------------------------------
-- Покупатель
-- ---------------------------------------------------------------------------

-- placeOrder(buyerId, distributorId, deliveryDate): покупатель = auth.uid(), p_buyer_id игнорируется
create or replace function zakupka.place_order(p_distributor_id text, p_delivery_date date, p_buyer_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = zakupka as $$
declare
  v_buyer uuid := auth.uid();
  v_store text;
  r zakupka.routes;
  d zakupka.distributors;
  l record;
  v_total numeric := 0;
  v_pos smallint := 0;
  v_id text;
  v_num integer;
begin
  if zakupka.auth_role() is distinct from 'buyer' then
    raise exception 'Заказ оформляет покупатель' using errcode = '42501';
  end if;
  if p_buyer_id is not null and p_buyer_id <> v_buyer then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  select store_id into v_store from zakupka.cart_lines
   where buyer_id = v_buyer and distributor_id = p_distributor_id
   order by updated_at desc limit 1;
  if v_store is null then perform zakupka._fail('Корзина этого поставщика пуста'); end if;

  select * into r from zakupka.routes where distributor_id = p_distributor_id and store_id = v_store;
  if not found then perform zakupka._fail('Поставщик не возит в выбранный магазин'); end if;
  if not (p_delivery_date = any (zakupka.next_delivery_dates(r.weekdays, r.cutoff_hour, 6))) then
    perform zakupka._fail('На эту дату заказ уже не принимается');
  end if;

  for l in
    select c.qty, p.* from zakupka.cart_lines c join zakupka.products p on p.id = c.product_id
     where c.buyer_id = v_buyer and c.distributor_id = p_distributor_id
     order by c.created_at
  loop
    if not l.active then perform zakupka._fail(format('«%s» снят с продажи', l.name)); end if;
    if l.stock < l.qty then perform zakupka._fail(format('«%s»: на складе %s %s', l.name, l.stock, l.unit)); end if;
    v_total := v_total + l.qty * l.price;
  end loop;
  if v_total < r.min_order then
    perform zakupka._fail('Минимальный заказ у поставщика — ' || zakupka._rub(r.min_order));
  end if;

  select * into d from zakupka.distributors where id = p_distributor_id;
  v_num := nextval('zakupka.order_number_seq');
  insert into zakupka.orders (number, buyer_id, distributor_id, store_id, delivery_date, status, total, label, payment_method)
  values (v_num, v_buyer, p_distributor_id, v_store, p_delivery_date, 'awaiting_payment', v_total,
          d.short || '-' || v_num, case when d.has_acquiring then 'card_link' else 'agent_cash' end)
  returning id into v_id;

  for l in
    select c.qty, p.* from zakupka.cart_lines c join zakupka.products p on p.id = c.product_id
     where c.buyer_id = v_buyer and c.distributor_id = p_distributor_id
     order by c.created_at
  loop
    insert into zakupka.order_items (order_id, product_id, position, name, unit, price, qty)
    values (v_id, l.id, v_pos, l.name, l.unit, l.price, l.qty);
    v_pos := v_pos + 1;
  end loop;

  perform zakupka._log(v_id, 'awaiting_payment', 'Заказ создан, ссылка на оплату отправлена в СМС', 'buyer');
  -- заглушка СМС от эквайринга дистрибьютора
  perform zakupka._notify(array[v_buyer], format('СМС: ссылка на оплату заказа №%s', v_num),
    format('%s: оплатите %s по ссылке /pay/%s', d.name, zakupka._rub(v_total), v_id), '/pay/' || v_id, 'info');
  return zakupka._order_json(v_id);
end $$;

-- payOrder: заглушка эквайринга. В проде статус меняет вебхук платёжки (service_role).
create or replace function zakupka.pay_order(p_order_id text)
returns jsonb
language plpgsql security definer set search_path = zakupka as $$
declare
  o zakupka.orders := zakupka._get_order(p_order_id);
  s zakupka.stores;
  v_receipt text := 'ФД ' || (10000 + floor(random() * 89999))::int;
  v_lines int;
begin
  perform zakupka._require(o, 'buyer');
  perform zakupka._expect(o, 'awaiting_payment');

  update zakupka.orders set paid_at = now(), receipt_no = v_receipt where id = o.id;
  update zakupka.products p set stock = greatest(0, p.stock - i.qty)
    from zakupka.order_items i where i.order_id = o.id and p.id = i.product_id;
  delete from zakupka.cart_lines where buyer_id = o.buyer_id and distributor_id = o.distributor_id;
  perform zakupka._log(o.id, 'placed', format('Оплачено %s по ссылке, чек %s отправлен в СМС', zakupka._rub(o.total), v_receipt), 'buyer');

  select * into s from zakupka.stores where id = o.store_id;
  select count(*) into v_lines from zakupka.order_items where order_id = o.id;
  perform zakupka._notify(array[o.buyer_id], format('Заказ №%s оплачен', o.number),
    format('Чек %s от дистрибьютора: /r/%s. Привоз %s, %s.', v_receipt, o.id, zakupka._day(o.delivery_date), s.name),
    '/buyer/orders/' || o.id, 'good');
  perform zakupka._notify(zakupka._managers_of(o.distributor_id), format('Новый заказ №%s · %s', o.number, zakupka._rub(o.total)),
    format('Позиций: %s, %s, привоз %s. Нужно подтвердить.', v_lines, s.name, zakupka._day(o.delivery_date)),
    '/distributor/orders/' || o.id, 'info');
  return zakupka._order_json(o.id);
end $$;

-- Общая часть отмены (engine.cancelOrder), без проверки прав
create or replace function zakupka._cancel(o zakupka.orders, p_by text, p_reason text)
returns void
language plpgsql as $$
declare v_paid boolean := o.status = 'placed';
begin
  perform zakupka._expect(o, 'awaiting_payment', 'placed');
  if v_paid then
    update zakupka.orders set refund = total where id = o.id;
    update zakupka.products p set stock = p.stock + i.qty
      from zakupka.order_items i where i.order_id = o.id and p.id = i.product_id;
  end if;
  perform zakupka._log(o.id, 'cancelled',
    case when p_by = 'buyer' then 'Покупатель отменил заказ'
         else 'Отклонён: ' || coalesce(nullif(p_reason, ''), 'без причины') end, p_by);
  if p_by = 'buyer' and v_paid then
    perform zakupka._notify(zakupka._managers_of(o.distributor_id), format('Заказ №%s отменён покупателем', o.number),
      format('Возврат %s по ссылке оплаты.', zakupka._rub(o.total)), '/distributor/orders/' || o.id, 'warn');
  end if;
  if p_by <> 'buyer' then
    perform zakupka._notify(array[o.buyer_id], format('Заказ №%s отклонён поставщиком', o.number),
      format('%s. Деньги %s вернутся на карту.', coalesce(nullif(p_reason, ''), 'Поставщик не сможет привезти заказ'),
             zakupka._rub(o.total)), '/buyer/orders/' || o.id, 'warn');
  end if;
end $$;

-- cancelOrder(orderId, by, reason): роль берётся из профиля, p_by только для совместимости сигнатуры
create or replace function zakupka.cancel_order(p_order_id text, p_by text default null, p_reason text default '')
returns void
language plpgsql security definer set search_path = zakupka as $$
declare
  o zakupka.orders := zakupka._get_order(p_order_id);
  v_by text := zakupka._require(o, 'buyer', 'distributor');
begin
  perform zakupka._cancel(o, v_by, p_reason);
end $$;

create or replace function zakupka.open_dispute(p_order_id text, p_text text)
returns void
language plpgsql security definer set search_path = zakupka as $$
declare o zakupka.orders := zakupka._get_order(p_order_id);
begin
  perform zakupka._require(o, 'buyer');
  if coalesce(trim(p_text), '') = '' then perform zakupka._fail('Опишите проблему'); end if;
  update zakupka.orders set dispute_text = p_text, dispute_at = now(), dispute_resolved = false where id = o.id;
  perform zakupka._log(o.id, 'note', format('Покупатель открыл обращение: «%s»', p_text), 'buyer');
  perform zakupka._notify(zakupka._admins(), format('Обращение по заказу №%s', o.number), p_text,
    '/admin/orders?open=' || o.id, 'warn');
end $$;

-- ---------------------------------------------------------------------------
-- Профиль
-- ---------------------------------------------------------------------------

-- Демо-ключ («u-anna») → uuid; uuid оставляем как есть
create or replace function zakupka.uid(p_key text) returns uuid
language sql immutable as $$
  select case when p_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then p_key::uuid else md5('zakupka:' || p_key)::uuid end
$$;

-- Профиль текущего пользователя; при первом входе — покупатель
create or replace function zakupka.ensure_profile() returns jsonb
language plpgsql security definer set search_path = zakupka as $$
declare
  u auth.users;
  p zakupka.profiles;
begin
  select * into u from auth.users where id = auth.uid();
  if not found then raise exception 'Требуется вход' using errcode = '42501'; end if;
  insert into zakupka.profiles (id, role, name, phone)
  values (u.id, 'buyer',
          coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), 'Новый покупатель'),
          nullif(regexp_replace(coalesce(u.raw_user_meta_data ->> 'phone', u.phone, ''), '\D', '', 'g'), ''))
  on conflict (id) do nothing;
  select * into p from zakupka.profiles where id = u.id;
  return jsonb_strip_nulls(jsonb_build_object('id', p.id, 'role', p.role, 'name', p.name, 'phone', p.phone,
    'storeId', p.store_id, 'distributorId', p.distributor_id, 'favoriteStoreId', p.favorite_store_id));
end $$;

-- Вход по телефону в демо: если номер принадлежит демо-аккаунту — его email (для signInWithPassword)
create or replace function zakupka.demo_email_by_phone(p_phone text) returns text
language sql stable security definer set search_path = zakupka as $$
  select u.email
    from zakupka.profiles p join auth.users u on u.id = p.id
   where p.phone = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
     and u.email like '%@zakupka.demo'
   limit 1
$$;

create or replace function zakupka.rename_user(p_name text) returns void
language plpgsql security definer set search_path = zakupka as $$
begin
  if coalesce(trim(p_name), '') = '' then return; end if;
  update zakupka.profiles set name = trim(p_name) where id = auth.uid();
end $$;

create or replace function zakupka.set_favorite_store(p_store_id text) returns void
language plpgsql security definer set search_path = zakupka as $$
begin
  if not exists (select 1 from zakupka.stores where id = p_store_id) then perform zakupka._fail('Магазин не найден'); end if;
  update zakupka.profiles set favorite_store_id = p_store_id where id = auth.uid();
  update zakupka.cart_lines set store_id = p_store_id where buyer_id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- Корзина и уведомления
-- ---------------------------------------------------------------------------

-- cartSet(buyerId, storeId, productId, qty): 0 — удалить; триггеры ограничат остатком и перенесут магазин
create or replace function zakupka.cart_set(p_store_id text, p_product_id text, p_qty int) returns void
language plpgsql security definer set search_path = zakupka as $$
declare v_stock int;
begin
  if auth.uid() is null then raise exception 'Требуется вход' using errcode = '42501'; end if;
  select stock into v_stock from zakupka.products where id = p_product_id;
  if not found then perform zakupka._fail('Товар не найден'); end if;
  if coalesce(p_qty, 0) <= 0 or v_stock = 0 then
    delete from zakupka.cart_lines where buyer_id = auth.uid() and product_id = p_product_id;
    return;
  end if;
  insert into zakupka.cart_lines (buyer_id, store_id, distributor_id, product_id, qty)
  values (auth.uid(), p_store_id, '', p_product_id, p_qty)
  on conflict (buyer_id, product_id) do update set qty = excluded.qty, store_id = excluded.store_id;
end $$;

create or replace function zakupka.mark_read(p_id text default null) returns void
language sql security definer set search_path = zakupka as $$
  update zakupka.notifications set read = true
   where user_id = auth.uid() and not read and (p_id is null or id = p_id)
$$;

-- ---------------------------------------------------------------------------
-- Дистрибьютор: каталог и график
-- ---------------------------------------------------------------------------

create or replace function zakupka._can_distributor(p_distributor_id text) returns boolean
language sql stable as $$ select zakupka.is_admin() or p_distributor_id = zakupka.auth_distributor_id() $$;

-- updateProduct(id, patch): price, stock, active, shelfPrice, promo
create or replace function zakupka.update_product(p_id text, p_patch jsonb) returns void
language plpgsql security definer set search_path = zakupka as $$
declare p zakupka.products;
begin
  select * into p from zakupka.products where id = p_id for update;
  if not found then perform zakupka._fail('Товар не найден'); end if;
  if not zakupka._can_distributor(p.distributor_id) then raise exception 'Нет доступа' using errcode = '42501'; end if;
  update zakupka.products set
    price = coalesce((p_patch ->> 'price')::numeric, price),
    stock = coalesce((p_patch ->> 'stock')::int, stock),
    active = coalesce((p_patch ->> 'active')::boolean, active),
    shelf_price = coalesce((p_patch ->> 'shelfPrice')::numeric, shelf_price),
    promo = case when p_patch ? 'promo' then p_patch ->> 'promo' else promo end
  where id = p_id;
end $$;

-- upsertRoute({id?, distributorId, storeId, weekdays, cutoffHour, minOrder})
create or replace function zakupka.upsert_route(p_route jsonb) returns jsonb
language plpgsql security definer set search_path = zakupka as $$
declare
  v_dist text := p_route ->> 'distributorId';
  r zakupka.routes;
begin
  if not zakupka._can_distributor(v_dist) then raise exception 'Нет доступа' using errcode = '42501'; end if;
  insert into zakupka.routes (id, distributor_id, store_id, weekdays, cutoff_hour, min_order)
  values (coalesce(p_route ->> 'id', gen_random_uuid()::text), v_dist, p_route ->> 'storeId',
          coalesce((select array_agg(x::smallint) from jsonb_array_elements_text(p_route -> 'weekdays') x), '{}'),
          coalesce((p_route ->> 'cutoffHour')::smallint, 18), coalesce((p_route ->> 'minOrder')::numeric, 0))
  on conflict (distributor_id, store_id) do update set
    weekdays = excluded.weekdays, cutoff_hour = excluded.cutoff_hour, min_order = excluded.min_order
  returning * into r;
  return jsonb_build_object('id', r.id, 'distributorId', r.distributor_id, 'storeId', r.store_id,
    'weekdays', to_jsonb(r.weekdays), 'cutoffHour', r.cutoff_hour, 'minOrder', r.min_order);
end $$;

create or replace function zakupka.remove_route(p_id text) returns void
language plpgsql security definer set search_path = zakupka as $$
declare r zakupka.routes;
begin
  select * into r from zakupka.routes where id = p_id;
  if not found then return; end if;
  if not zakupka._can_distributor(r.distributor_id) then raise exception 'Нет доступа' using errcode = '42501'; end if;
  delete from zakupka.routes where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Админка
-- ---------------------------------------------------------------------------

create or replace function zakupka._admin_only() returns void
language plpgsql stable as $$
begin
  if not zakupka.is_admin() then raise exception 'Только для команды платформы' using errcode = '42501'; end if;
end $$;

create or replace function zakupka.toggle_store(p_id text) returns void
language plpgsql security definer set search_path = zakupka as $$
begin
  perform zakupka._admin_only();
  update zakupka.stores set active = not active where id = p_id;
end $$;

create or replace function zakupka.toggle_distributor(p_id text) returns void
language plpgsql security definer set search_path = zakupka as $$
begin
  perform zakupka._admin_only();
  update zakupka.distributors set active = not active where id = p_id;
end $$;

-- updateStore(id, patch): capacity, storageDays, pickupFee
create or replace function zakupka.update_store(p_id text, p_patch jsonb) returns void
language plpgsql security definer set search_path = zakupka as $$
begin
  perform zakupka._admin_only();
  update zakupka.stores set
    capacity = coalesce((p_patch ->> 'capacity')::int, capacity),
    storage_days = coalesce((p_patch ->> 'storageDays')::smallint, storage_days),
    pickup_fee = coalesce((p_patch ->> 'pickupFee')::numeric, pickup_fee)
  where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Демо-данные: клиент присылает тот же снимок, что строит src/lib/seed.ts
-- (даты всегда относительно «сегодня»), функция заменяет им все данные «Закупки».
-- Разрешено демо-аккаунтам (@zakupka.demo) и из SQL-редактора.
-- ---------------------------------------------------------------------------

create or replace function zakupka.demo_load(p_db jsonb) returns void
language plpgsql security definer set search_path = zakupka as $$
declare
  v_email text;
  o jsonb;
  it jsonb;
  h jsonb;
  c jsonb;
  k text;
  ln jsonb;
  v_pos int;
begin
  if auth.uid() is not null then
    select email into v_email from auth.users where id = auth.uid();
    if v_email is null or v_email not like '%@zakupka.demo' then
      raise exception 'Сброс доступен только демо-аккаунтам' using errcode = '42501';
    end if;
  end if;

  -- только наши таблицы
  truncate zakupka.cart_lines, zakupka.notifications, zakupka.order_events, zakupka.order_items,
           zakupka.orders, zakupka.trips, zakupka.products, zakupka.routes, zakupka.profiles,
           zakupka.distributors, zakupka.stores;

  insert into zakupka.stores (id, name, address, district, hours, x, y, capacity, storage_days, pickup_fee, active)
  select s ->> 'id', s ->> 'name', s ->> 'address', s ->> 'district', s ->> 'hours', (s ->> 'x')::int, (s ->> 'y')::int,
         (s ->> 'capacity')::int, (s ->> 'storageDays')::int, (s ->> 'pickupFee')::numeric, (s ->> 'active')::boolean
    from jsonb_array_elements(p_db -> 'stores') s;

  insert into zakupka.distributors (id, name, short, about, color, inn, has_acquiring, active)
  select d ->> 'id', d ->> 'name', d ->> 'short', d ->> 'about', d ->> 'color', d ->> 'inn',
         (d ->> 'hasAcquiring')::boolean, (d ->> 'active')::boolean
    from jsonb_array_elements(p_db -> 'distributors') d;

  insert into zakupka.profiles (id, role, name, phone, store_id, distributor_id, favorite_store_id)
  select zakupka.uid(u ->> 'id'), (u ->> 'role')::zakupka.user_role, u ->> 'name', u ->> 'phone',
         u ->> 'storeId', u ->> 'distributorId', u ->> 'favoriteStoreId'
    from jsonb_array_elements(p_db -> 'users') u;

  insert into zakupka.routes (id, distributor_id, store_id, weekdays, cutoff_hour, min_order)
  select r ->> 'id', r ->> 'distributorId', r ->> 'storeId',
         (select array_agg(x::smallint) from jsonb_array_elements_text(r -> 'weekdays') x),
         (r ->> 'cutoffHour')::int, (r ->> 'minOrder')::numeric
    from jsonb_array_elements(p_db -> 'routes') r;

  insert into zakupka.products (id, distributor_id, sku, name, brand, category, unit, pack, weight, price, shelf_price,
                                stock, art, tint, promo, active)
  select p ->> 'id', p ->> 'distributorId', p ->> 'sku', p ->> 'name', p ->> 'brand', p ->> 'category', p ->> 'unit',
         (p ->> 'pack')::int, p ->> 'weight', (p ->> 'price')::numeric, (p ->> 'shelfPrice')::numeric,
         (p ->> 'stock')::int, p ->> 'art', p ->> 'tint', p ->> 'promo', (p ->> 'active')::boolean
    from jsonb_array_elements(p_db -> 'products') p;

  insert into zakupka.trips (id, distributor_id, date, store_ids, driver, vehicle, status)
  select t ->> 'id', t ->> 'distributorId', (t ->> 'date')::date,
         (select array_agg(x) from jsonb_array_elements_text(t -> 'storeIds') x), t ->> 'driver', t ->> 'vehicle', t ->> 'status'
    from jsonb_array_elements(p_db -> 'trips') t;

  for o in select * from jsonb_array_elements(p_db -> 'orders') loop
    insert into zakupka.orders (id, number, buyer_id, distributor_id, store_id, delivery_date, status, total, refund,
                                pickup_code, label, trip_id, shelf_slot, stored_until, payment_method, paid_at, receipt_no,
                                dispute_text, dispute_at, dispute_resolved, created_at, updated_at)
    values (o ->> 'id', (o ->> 'number')::int, zakupka.uid(o ->> 'buyerId'), o ->> 'distributorId', o ->> 'storeId',
            (o ->> 'deliveryDate')::date, (o ->> 'status')::zakupka.order_status, (o ->> 'total')::numeric,
            (o ->> 'refund')::numeric, o ->> 'pickupCode', o ->> 'label', o ->> 'tripId', o ->> 'shelfSlot',
            (o ->> 'storedUntil')::date, coalesce(o #>> '{payment,method}', 'card_link'),
            (o #>> '{payment,paidAt}')::timestamptz, o #>> '{payment,receiptNo}',
            o #>> '{dispute,text}', (o #>> '{dispute,at}')::timestamptz, (o #>> '{dispute,resolved}')::boolean,
            (o ->> 'createdAt')::timestamptz, (o ->> 'updatedAt')::timestamptz);
    v_pos := 0;
    for it in select * from jsonb_array_elements(o -> 'items') loop
      insert into zakupka.order_items (order_id, product_id, position, name, unit, price, qty, confirmed_qty, received_qty)
      values (o ->> 'id', it ->> 'productId', v_pos, it ->> 'name', it ->> 'unit', (it ->> 'price')::numeric,
              (it ->> 'qty')::int, (it ->> 'confirmedQty')::int, (it ->> 'receivedQty')::int)
      on conflict do nothing;
      v_pos := v_pos + 1;
    end loop;
    for h in select * from jsonb_array_elements(o -> 'history') loop
      insert into zakupka.order_events (order_id, at, status, text, by_role)
      values (o ->> 'id', (h ->> 'at')::timestamptz, h ->> 'status', h ->> 'text', h ->> 'by');
    end loop;
  end loop;
  perform setval('zakupka.order_number_seq', greatest(1001, (select coalesce(max(number), 1000) + 1 from zakupka.orders)), false);

  insert into zakupka.notifications (id, user_id, at, title, body, href, read, tone)
  select n ->> 'id', zakupka.uid(n ->> 'userId'), (n ->> 'at')::timestamptz, n ->> 'title', n ->> 'body', n ->> 'href',
         (n ->> 'read')::boolean, n ->> 'tone'
    from jsonb_array_elements(p_db -> 'notifications') n;

  for c in select * from jsonb_array_elements(p_db -> 'carts') loop
    for k, ln in select key, value from jsonb_each(c -> 'lines') loop
      insert into zakupka.cart_lines (buyer_id, store_id, distributor_id, product_id, qty)
      select zakupka.uid(c ->> 'buyerId'), c ->> 'storeId', k, l ->> 'productId', (l ->> 'qty')::int
        from jsonb_array_elements(ln) l
      on conflict do nothing;
    end loop;
  end loop;

  -- вошедшие ранее живые пользователи получат профиль заново при следующем входе (ensure_profile)
end $$;

-- ---------------------------------------------------------------------------
-- Права внутри схемы: по умолчанию функции доступны всем — закрываем и открываем точечно
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema zakupka from public, anon, authenticated;

-- RLS-хелперы вызываются политиками от имени пользователя
grant execute on function zakupka.auth_role(), zakupka.auth_store_id(), zakupka.auth_distributor_id(), zakupka.is_admin()
  to authenticated;
-- триггерные функции выполняются от имени того, кто пишет (а пишут только security definer команды)
grant execute on function zakupka.set_updated_at(), zakupka.cart_lines_before(), zakupka.cart_lines_sync_store(),
  zakupka.profiles_guard() to authenticated;
-- снимок — security invoker, внутри order_json и next_delivery_dates
grant execute on function zakupka.get_snapshot(), zakupka.order_json(zakupka.orders) to authenticated;

-- ---------------------------------------------------------------------------
-- Публичный API: тонкие обёртки, имена с префиксом zk_ — чтобы не пересекаться с соседями по проекту
-- ---------------------------------------------------------------------------

create or replace function public.zk_get_snapshot() returns jsonb
language sql stable security invoker set search_path = '' as $$ select zakupka.get_snapshot() $$;
create or replace function public.zk_ensure_profile() returns jsonb
language sql security definer set search_path = '' as $$ select zakupka.ensure_profile() $$;
create or replace function public.zk_demo_email_by_phone(p_phone text) returns text
language sql stable security definer set search_path = '' as $$ select zakupka.demo_email_by_phone(p_phone) $$;
create or replace function public.zk_demo_load(p_db jsonb) returns void
language sql security definer set search_path = '' as $$ select zakupka.demo_load(p_db) $$;

create or replace function public.zk_rename_user(p_name text) returns void
language sql security definer set search_path = '' as $$ select zakupka.rename_user(p_name) $$;
create or replace function public.zk_set_favorite_store(p_store_id text) returns void
language sql security definer set search_path = '' as $$ select zakupka.set_favorite_store(p_store_id) $$;
create or replace function public.zk_cart_set(p_store_id text, p_product_id text, p_qty int) returns void
language sql security definer set search_path = '' as $$ select zakupka.cart_set(p_store_id, p_product_id, p_qty) $$;
create or replace function public.zk_mark_read(p_id text default null) returns void
language sql security definer set search_path = '' as $$ select zakupka.mark_read(p_id) $$;

create or replace function public.zk_place_order(p_distributor_id text, p_delivery_date date) returns jsonb
language sql security definer set search_path = '' as $$ select zakupka.place_order(p_distributor_id, p_delivery_date) $$;
create or replace function public.zk_pay_order(p_order_id text) returns jsonb
language sql security definer set search_path = '' as $$ select zakupka.pay_order(p_order_id) $$;
create or replace function public.zk_cancel_order(p_order_id text, p_reason text default '') returns void
language sql security definer set search_path = '' as $$ select zakupka.cancel_order(p_order_id, null, p_reason) $$;
create or replace function public.zk_open_dispute(p_order_id text, p_text text) returns void
language sql security definer set search_path = '' as $$ select zakupka.open_dispute(p_order_id, p_text) $$;

create or replace function public.zk_confirm_order(p_order_id text, p_qty jsonb) returns void
language sql security definer set search_path = '' as $$ select zakupka.confirm_order(p_order_id, p_qty) $$;
create or replace function public.zk_assemble_orders(p_order_ids text[]) returns void
language sql security definer set search_path = '' as $$ select zakupka.assemble_orders(p_order_ids) $$;
create or replace function public.zk_dispatch_trip(p_distributor_id text, p_date date, p_driver text, p_vehicle text) returns jsonb
language sql security definer set search_path = '' as $$ select zakupka.dispatch_trip(p_distributor_id, p_date, p_driver, p_vehicle) $$;
create or replace function public.zk_return_unclaimed(p_order_id text) returns void
language sql security definer set search_path = '' as $$ select zakupka.return_unclaimed(p_order_id) $$;
create or replace function public.zk_import_price(p_distributor_id text, p_rows jsonb) returns jsonb
language sql security definer set search_path = '' as $$ select zakupka.import_price(p_distributor_id, p_rows) $$;
create or replace function public.zk_update_product(p_id text, p_patch jsonb) returns void
language sql security definer set search_path = '' as $$ select zakupka.update_product(p_id, p_patch) $$;
create or replace function public.zk_upsert_route(p_route jsonb) returns jsonb
language sql security definer set search_path = '' as $$ select zakupka.upsert_route(p_route) $$;
create or replace function public.zk_remove_route(p_id text) returns void
language sql security definer set search_path = '' as $$ select zakupka.remove_route(p_id) $$;

create or replace function public.zk_receive_order(p_order_id text, p_received jsonb default null) returns void
language sql security definer set search_path = '' as $$ select zakupka.receive_order(p_order_id, p_received) $$;
create or replace function public.zk_issue_order(p_order_id text) returns void
language sql security definer set search_path = '' as $$ select zakupka.issue_order(p_order_id) $$;
create or replace function public.zk_mark_unclaimed(p_order_id text) returns void
language sql security definer set search_path = '' as $$ select zakupka.mark_unclaimed(p_order_id) $$;
create or replace function public.zk_extend_storage(p_order_id text, p_days int) returns void
language sql security definer set search_path = '' as $$ select zakupka.extend_storage(p_order_id, p_days) $$;

create or replace function public.zk_resolve_dispute(p_order_id text, p_answer text) returns void
language sql security definer set search_path = '' as $$ select zakupka.resolve_dispute(p_order_id, p_answer) $$;
create or replace function public.zk_attach_staff(p_user_id uuid, p_store_id text default null) returns void
language sql security definer set search_path = '' as $$ select zakupka.attach_staff(p_user_id, p_store_id) $$;
create or replace function public.zk_toggle_store(p_id text) returns void
language sql security definer set search_path = '' as $$ select zakupka.toggle_store(p_id) $$;
create or replace function public.zk_toggle_distributor(p_id text) returns void
language sql security definer set search_path = '' as $$ select zakupka.toggle_distributor(p_id) $$;
create or replace function public.zk_update_store(p_id text, p_patch jsonb) returns void
language sql security definer set search_path = '' as $$ select zakupka.update_store(p_id, p_patch) $$;

-- Права только на наши обёртки: вход по телефону — до входа, остальное — вошедшим
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'zk\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
    if f.proname = 'zk_demo_email_by_phone' then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
  end loop;
end $$;
