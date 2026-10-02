-- «Закупка»: 4 функции с DELETE/TRUNCATE внутри — их инструмент Claude не может применить без вашего подтверждения.
-- Всё остальное уже применено. Затрагивают только таблицы схемы zakupka:
--   pay_order    — очищает корзину оплаченного поставщика
--   cart_set     — удаляет строку корзины при количестве 0
--   remove_route — удаляет точку из графика дистрибьютора
--   demo_load    — сбрасывает демо-данные «Закупки» (TRUNCATE только таблиц zakupka)
-- Supabase → проект Imgtexh → SQL Editor → вставить файл целиком → Run.

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

create or replace function zakupka.remove_route(p_id text) returns void
language plpgsql security definer set search_path = zakupka as $$
declare r zakupka.routes;
begin
  select * into r from zakupka.routes where id = p_id;
  if not found then return; end if;
  if not zakupka._can_distributor(r.distributor_id) then raise exception 'Нет доступа' using errcode = '42501'; end if;
  delete from zakupka.routes where id = p_id;
end $$;

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

create or replace function public.zk_pay_order(p_order_id text) returns jsonb
language sql security definer set search_path = '' as $$ select zakupka.pay_order(p_order_id) $$;
create or replace function public.zk_cart_set(p_store_id text, p_product_id text, p_qty int) returns void
language sql security definer set search_path = '' as $$ select zakupka.cart_set(p_store_id, p_product_id, p_qty) $$;
create or replace function public.zk_remove_route(p_id text) returns void
language sql security definer set search_path = '' as $$ select zakupka.remove_route(p_id) $$;
create or replace function public.zk_demo_load(p_db jsonb) returns void
language sql security definer set search_path = '' as $$
  select zakupka._seeding();
  select zakupka.demo_load(p_db);
$$;

-- права: внутренние функции закрыты, обёртки — только вошедшим
revoke execute on function zakupka.pay_order(text), zakupka.cart_set(text, text, int), zakupka.remove_route(text),
  zakupka.demo_load(jsonb) from public, anon, authenticated;
revoke execute on function public.zk_pay_order(text), public.zk_cart_set(text, text, int), public.zk_remove_route(text),
  public.zk_demo_load(jsonb) from public, anon;
grant execute on function public.zk_pay_order(text), public.zk_cart_set(text, text, int), public.zk_remove_route(text),
  public.zk_demo_load(jsonb) to authenticated;

-- пробная функция, оставшаяся от проверки подключения
drop function if exists zakupka._probe();
