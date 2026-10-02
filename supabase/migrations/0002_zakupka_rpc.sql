-- «Закупка»: команды жизненного цикла заказа. Повторяют src/lib/engine.ts:
-- те же имена (snake_case), те же допустимые переходы статусов (expect(...)),
-- та же история (order_events) и уведомления. Клиент: supabase.rpc('<имя>', {p_...}).
-- Ошибки предметной области — raise exception ... using errcode = 'P0001' (текст для тоста).

-- ---------------------------------------------------------------------------
-- Служебные функции (недоступны клиенту, см. revoke в конце файла)
-- ---------------------------------------------------------------------------

-- «Сегодня» в часовом поясе пилота (Брянск)
create or replace function zakupka._today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Moscow')::date $$;

-- 1290 → «1 290 ₽»
create or replace function zakupka._rub(n numeric) returns text
language sql immutable as $$ select replace(to_char(round(n), 'FM999,999,990'), ',', ' ') || ' ₽' $$;

-- 2026-10-03 → «03.10»
create or replace function zakupka._day(d date) returns text
language sql immutable as $$ select to_char(d, 'DD.MM') $$;

create or replace function zakupka._fail(msg text) returns void
language plpgsql as $$ begin raise exception '%', msg using errcode = 'P0001'; end $$;

-- delivery.ts nextDeliveryDates: ближайшие даты привоза; на завтра — только до cutoff_hour сегодня
create or replace function zakupka.next_delivery_dates(p_weekdays smallint[], p_cutoff int, p_count int default 3)
returns date[]
language plpgsql stable as $$
declare
  local_now timestamp := now() at time zone 'Europe/Moscow';
  d date;
  res date[] := '{}';
begin
  for i in 1..20 loop
    exit when cardinality(res) >= p_count;
    d := local_now::date + i;
    continue when not (extract(isodow from d)::smallint = any (p_weekdays));
    continue when i = 1 and extract(hour from local_now) >= p_cutoff;
    res := res || d;
  end loop;
  return res;
end $$;

create or replace function zakupka._managers_of(p_distributor_id text) returns uuid[]
language sql stable as $$
  select coalesce(array_agg(id), '{}') from zakupka.profiles where role = 'distributor' and distributor_id = p_distributor_id
$$;

create or replace function zakupka._staff_of(p_store_id text) returns uuid[]
language sql stable as $$
  select coalesce(array_agg(id), '{}') from zakupka.profiles where role = 'store' and store_id = p_store_id
$$;

create or replace function zakupka._admins() returns uuid[]
language sql stable as $$
  select coalesce(array_agg(id), '{}') from zakupka.profiles where role = 'admin'
$$;

create or replace function zakupka._notify(p_users uuid[], p_title text, p_body text, p_href text, p_tone text default 'info')
returns void
language sql as $$
  insert into zakupka.notifications (user_id, title, body, href, tone)
  select u, p_title, p_body, p_href, p_tone from unnest(p_users) as u
$$;

-- engine.log: запись в историю + смена статуса (кроме 'note')
create or replace function zakupka._log(p_order_id text, p_status text, p_text text, p_by text)
returns void
language plpgsql as $$
begin
  insert into zakupka.order_events (order_id, status, text, by_role, actor_id)
  values (p_order_id, p_status, p_text, p_by, auth.uid());
  if p_status = 'note' then
    update zakupka.orders set updated_at = now() where id = p_order_id;
  else
    update zakupka.orders set status = p_status::zakupka.order_status where id = p_order_id;
  end if;
end $$;

-- getOrder + блокировка строки
create or replace function zakupka._get_order(p_order_id text) returns zakupka.orders
language plpgsql as $$
declare o zakupka.orders;
begin
  select * into o from zakupka.orders where id = p_order_id for update;
  if not found then perform zakupka._fail('Заказ не найден'); end if;
  return o;
end $$;

-- engine.expect
create or replace function zakupka._expect(o zakupka.orders, variadic allowed zakupka.order_status[]) returns void
language plpgsql as $$
begin
  if not (o.status = any (allowed)) then
    perform zakupka._fail(format('Действие недоступно в статусе «%s»', case o.status
      when 'awaiting_payment' then 'ждёт оплаты' when 'placed' then 'оформлен'
      when 'confirmed' then 'подтверждён' when 'assembled' then 'собран'
      when 'in_transit' then 'в пути' when 'at_store' then 'в магазине'
      when 'issued' then 'выдан' when 'unclaimed' then 'невыкуп'
      when 'returned' then 'возвращён' when 'cancelled' then 'отменён' end));
  end if;
end $$;

-- Проверка прав на заказ. who: 'buyer' | 'store' | 'distributor'; админ проходит всегда.
-- Возвращает роль, от имени которой пишется история.
create or replace function zakupka._require(o zakupka.orders, variadic who text[]) returns text
language plpgsql stable as $$
declare r zakupka.user_role := zakupka.auth_role();
begin
  if r is null then
    raise exception 'Требуется вход' using errcode = '42501';
  end if;
  if r = 'admin' then return 'admin'; end if;
  if r::text = any (who) and (
       (r = 'buyer' and o.buyer_id = auth.uid())
    or (r = 'store' and o.store_id = zakupka.auth_store_id())
    or (r = 'distributor' and o.distributor_id = zakupka.auth_distributor_id())) then
    return r::text;
  end if;
  raise exception 'Нет доступа к заказу' using errcode = '42501';
end $$;

-- Order в форме src/lib/types.ts (camelCase, отсутствующие поля без null)
create or replace function zakupka.order_json(o zakupka.orders) returns jsonb
language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', o.id,
    'number', o.number::text,
    'buyerId', o.buyer_id,
    'distributorId', o.distributor_id,
    'storeId', o.store_id,
    'deliveryDate', o.delivery_date,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'productId', i.product_id, 'name', i.name, 'unit', i.unit, 'price', i.price,
               'qty', i.qty, 'confirmedQty', i.confirmed_qty, 'receivedQty', i.received_qty)
             order by i.position)
      from zakupka.order_items i where i.order_id = o.id), '[]'::jsonb),
    'status', o.status,
    'total', o.total,
    'refund', o.refund,
    'pickupCode', o.pickup_code,
    'label', o.label,
    'tripId', o.trip_id,
    'shelfSlot', o.shelf_slot,
    'storedUntil', o.stored_until,
    'payment', jsonb_build_object('method', o.payment_method, 'paidAt', o.paid_at, 'receiptNo', o.receipt_no),
    'createdAt', o.created_at,
    'updatedAt', o.updated_at,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('at', e.at, 'status', e.status, 'text', e.text, 'by', e.by_role) order by e.id)
      from zakupka.order_events e where e.order_id = o.id), '[]'::jsonb),
    'dispute', case when o.dispute_text is not null then
      jsonb_build_object('text', o.dispute_text, 'at', o.dispute_at, 'resolved', coalesce(o.dispute_resolved, false)) end
  ))
$$;

create or replace function zakupka._order_json(p_order_id text) returns jsonb
language sql stable as $$ select zakupka.order_json(o) from zakupka.orders o where o.id = p_order_id $$;

-- ---------------------------------------------------------------------------
-- Дистрибьютор
-- ---------------------------------------------------------------------------

-- confirmOrder(orderId, qty): p_qty = {"<productId>": <кол-во>}, не указанные — полностью
create or replace function zakupka.confirm_order(p_order_id text, p_qty jsonb default '{}')
returns void
language plpgsql security definer set search_path = zakupka as $$
declare
  o zakupka.orders := zakupka._get_order(p_order_id);
  v_by text := zakupka._require(o, 'distributor');
  it record;
  q int;
  v_missing text[] := '{}';
  v_confirmed numeric;
  v_refund numeric;
begin
  perform zakupka._expect(o, 'placed');
  for it in select * from zakupka.order_items where order_id = o.id order by position loop
    q := greatest(0, least(it.qty, coalesce((p_qty ->> it.product_id)::int, it.qty)));
    update zakupka.order_items set confirmed_qty = q where order_id = o.id and product_id = it.product_id;
    if q < it.qty then
      v_missing := v_missing || format('%s — %s из %s', it.name, q, it.qty);
    end if;
  end loop;

  select coalesce(sum(confirmed_qty * price), 0) into v_confirmed from zakupka.order_items where order_id = o.id;
  if v_confirmed = 0 then
    -- отмена сама вернёт весь остаток на склад (в engine.ts здесь остаток возвращается дважды)
    perform zakupka._cancel(o, v_by, 'Ни одной позиции нет в наличии');
    return;
  end if;
  -- недовезённое возвращаем на склад
  update zakupka.products p set stock = p.stock + (i.qty - i.confirmed_qty)
    from zakupka.order_items i
   where i.order_id = o.id and p.id = i.product_id and i.confirmed_qty < i.qty;

  v_refund := o.total - v_confirmed;
  update zakupka.orders set refund = v_refund where id = o.id;
  perform zakupka._log(o.id, 'confirmed',
    case when cardinality(v_missing) > 0 then 'Подтверждён частично, возврат ' || zakupka._rub(v_refund)
         else 'Подтверждён полностью' end, v_by);
  if cardinality(v_missing) > 0 then
    perform zakupka._notify(array[o.buyer_id], format('Заказ №%s подтверждён частично', o.number),
      format('Нет в наличии: %s. Вернём %s на карту.', array_to_string(v_missing, '; '), zakupka._rub(v_refund)),
      '/buyer/orders/' || o.id, 'warn');
  else
    perform zakupka._notify(array[o.buyer_id], format('Заказ №%s подтверждён', o.number),
      format('Поставщик собирает заказ к %s.', zakupka._day(o.delivery_date)), '/buyer/orders/' || o.id, 'good');
  end if;
end $$;

create or replace function zakupka.assemble_orders(p_order_ids text[])
returns void
language plpgsql security definer set search_path = zakupka as $$
declare
  v_id text;
  o zakupka.orders;
  v_by text;
begin
  foreach v_id in array p_order_ids loop
    o := zakupka._get_order(v_id);
    v_by := zakupka._require(o, 'distributor');
    perform zakupka._expect(o, 'confirmed');
    perform zakupka._log(o.id, 'assembled', 'Собран и промаркирован: ' || o.label, v_by);
  end loop;
end $$;

-- dispatchTrip: собранные заказы на дату уезжают в магазины, невыкуп из этих магазинов забирается обратно
create or replace function zakupka.dispatch_trip(p_distributor_id text, p_date date, p_driver text, p_vehicle text)
returns jsonb
language plpgsql security definer set search_path = zakupka as $$
declare
  v_role zakupka.user_role := zakupka.auth_role();
  v_by text;
  t zakupka.trips;
  d zakupka.distributors;
  o zakupka.orders;
  v_store text;
  n int;
  v_back int;
begin
  if v_role = 'admin' then v_by := 'admin';
  elsif v_role = 'distributor' and p_distributor_id = zakupka.auth_distributor_id() then v_by := 'distributor';
  else raise exception 'Нет доступа' using errcode = '42501';
  end if;

  perform 1 from zakupka.orders
   where distributor_id = p_distributor_id and delivery_date = p_date and status = 'assembled'
   for update;
  if not found then perform zakupka._fail('Нет собранных заказов на эту дату'); end if;

  insert into zakupka.trips (distributor_id, date, store_ids, driver, vehicle, status)
  select p_distributor_id, p_date, array_agg(distinct store_id order by store_id), coalesce(p_driver, ''), coalesce(p_vehicle, ''), 'on_road'
    from zakupka.orders
   where distributor_id = p_distributor_id and delivery_date = p_date and status = 'assembled'
  returning * into t;

  select * into d from zakupka.distributors where id = p_distributor_id;

  for o in
    select * from zakupka.orders
     where distributor_id = p_distributor_id and delivery_date = p_date and status = 'assembled'
  loop
    update zakupka.orders set trip_id = t.id where id = o.id;
    perform zakupka._log(o.id, 'in_transit', 'Едет с поставкой, ' || coalesce(p_vehicle, ''), v_by);
    perform zakupka._notify(array[o.buyer_id], format('Заказ №%s в пути', o.number),
      format('Едет в %s с обычной поставкой. Пришлём код, как только магазин примет.',
             (select name from zakupka.stores where id = o.store_id)),
      '/buyer/orders/' || o.id, 'info');
  end loop;

  foreach v_store in array t.store_ids loop
    select count(*) into n from zakupka.orders where trip_id = t.id and store_id = v_store;
    -- водитель забирает невыкуп из магазинов рейса (engine: returnUnclaimed для каждого)
    v_back := 0;
    for o in
      select * from zakupka.orders
       where store_id = v_store and distributor_id = p_distributor_id and status = 'unclaimed'
       for update
    loop
      perform zakupka._return_unclaimed(o, v_by);
      v_back := v_back + 1;
    end loop;
    perform zakupka._notify(zakupka._staff_of(v_store), format('%s: едет заказов — %s', d.name, n),
      format('Поставка %s, %s.%s', zakupka._day(p_date), coalesce(p_vehicle, ''),
             case when v_back > 0 then format(' Отдайте водителю невыкуп: %s.', v_back) else '' end),
      '/store/incoming', 'info');
  end loop;

  return jsonb_build_object('id', t.id, 'distributorId', t.distributor_id, 'date', t.date, 'storeIds', to_jsonb(t.store_ids),
                            'driver', t.driver, 'vehicle', t.vehicle, 'status', t.status);
end $$;

-- Общая часть returnUnclaimed (вызывается и из dispatch_trip), без проверки прав
create or replace function zakupka._return_unclaimed(o zakupka.orders, p_by text)
returns void
language plpgsql as $$
begin
  perform zakupka._expect(o, 'unclaimed');
  perform zakupka._log(o.id, 'returned', 'Невыкуп забран поставщиком', p_by);
  update zakupka.products p set stock = p.stock + coalesce(i.received_qty, i.confirmed_qty, i.qty)
    from zakupka.order_items i where i.order_id = o.id and p.id = i.product_id;
end $$;

create or replace function zakupka.return_unclaimed(p_order_id text)
returns void
language plpgsql security definer set search_path = zakupka as $$
declare
  o zakupka.orders := zakupka._get_order(p_order_id);
  v_by text := zakupka._require(o, 'distributor');
begin
  perform zakupka._return_unclaimed(o, v_by);
end $$;

-- importPrice(distributorId, rows): rows = [{sku, name, price, unit?, stock?, category?, brand?, weight?, shelfPrice?}]
create or replace function zakupka.import_price(p_distributor_id text, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = zakupka as $$
declare
  r jsonb;
  v_updated int := 0;
  v_added int := 0;
  v_unit text;
  h int;
  arts text[] := array['box', 'bag', 'pack', 'jar', 'can', 'bar', 'bottle', 'tin'];
  tints text[] := array['#B8322A', '#2F6FB0', '#D8913A', '#4E6B2A', '#6B3A1E', '#E2B33B', '#7B2B3A', '#2D5D8C'];
begin
  if not (zakupka.is_admin() or p_distributor_id = zakupka.auth_distributor_id()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    update zakupka.products set
      price = (r ->> 'price')::numeric,
      stock = coalesce((r ->> 'stock')::int, stock),
      name = coalesce(nullif(r ->> 'name', ''), name),
      shelf_price = coalesce(nullif((r ->> 'shelfPrice')::numeric, 0), shelf_price),
      active = true
    where distributor_id = p_distributor_id and sku = r ->> 'sku';
    if found then
      v_updated := v_updated + 1;
    else
      v_unit := case when r ->> 'unit' in ('шт', 'уп', 'кор', 'бут', 'пач') then r ->> 'unit' else 'шт' end;
      select coalesce(sum(ascii(ch)), 0) into h from regexp_split_to_table(r ->> 'sku', '') as ch;
      insert into zakupka.products (distributor_id, sku, name, brand, category, unit, pack, weight,
                                   price, shelf_price, stock, art, tint, active)
      values (p_distributor_id, r ->> 'sku', r ->> 'name', coalesce(r ->> 'brand', ''), coalesce(r ->> 'category', 'Разное'),
              v_unit, 1, coalesce(r ->> 'weight', ''), (r ->> 'price')::numeric,
              coalesce((r ->> 'shelfPrice')::numeric, round((r ->> 'price')::numeric * 1.3)),
              coalesce((r ->> 'stock')::int, 50), arts[h % 8 + 1], tints[h % 8 + 1], true);
      v_added := v_added + 1;
    end if;
  end loop;
  return jsonb_build_object('updated', v_updated, 'added', v_added);
end $$;

-- ---------------------------------------------------------------------------
-- Магазин
-- ---------------------------------------------------------------------------

-- engine.freeSlot: первая свободная ячейка А-01…Ж-08, иначе «пол»
create or replace function zakupka._free_slot(p_store_id text) returns text
language plpgsql stable as $$
declare
  rws text := 'АБВГДЕЖ';
  s text;
begin
  for ri in 1..length(rws) loop
    for i in 1..8 loop
      s := substr(rws, ri, 1) || '-' || lpad(i::text, 2, '0');
      if not exists (select 1 from zakupka.orders
                      where store_id = p_store_id and status in ('at_store', 'unclaimed') and shelf_slot = s) then
        return s;
      end if;
    end loop;
  end loop;
  return 'пол';
end $$;

-- receiveOrder(orderId, received?): p_received = {"<productId>": <кол-во>} или null — всё приехало
create or replace function zakupka.receive_order(p_order_id text, p_received jsonb default null)
returns void
language plpgsql security definer set search_path = zakupka as $$
declare
  o zakupka.orders := zakupka._get_order(p_order_id);
  v_by text := zakupka._require(o, 'store');
  s zakupka.stores;
  it record;
  conf int;
  q int;
  v_short text[] := '{}';
  v_received numeric;
  v_refund numeric;
  v_slot text;
  v_until date;
begin
  perform zakupka._expect(o, 'in_transit');
  select * into s from zakupka.stores where id = o.store_id;
  -- сериализуем выдачу ячеек в пределах магазина
  perform pg_advisory_xact_lock(hashtext('slot:' || o.store_id));

  for it in select * from zakupka.order_items where order_id = o.id order by position loop
    conf := coalesce(it.confirmed_qty, it.qty);
    q := greatest(0, least(conf, coalesce((p_received ->> it.product_id)::int, conf)));
    update zakupka.order_items set received_qty = q where order_id = o.id and product_id = it.product_id;
    if q < conf then v_short := v_short || format('%s — %s из %s', it.name, q, conf); end if;
  end loop;

  select coalesce(sum(received_qty * price), 0) into v_received from zakupka.order_items where order_id = o.id;
  v_refund := o.total - v_received;
  v_slot := zakupka._free_slot(o.store_id);
  v_until := zakupka._today() + s.storage_days;
  update zakupka.orders set refund = v_refund, shelf_slot = v_slot, stored_until = v_until where id = o.id;

  perform zakupka._log(o.id, 'at_store',
    case when cardinality(v_short) > 0
         then format('Принят с недовозом (%s), ячейка %s', array_to_string(v_short, '; '), v_slot)
         else 'Принят магазином, ячейка ' || v_slot end, v_by);
  perform zakupka._notify(array[o.buyer_id], format('Заказ №%s ждёт вас', o.number),
    format('%s, %s. Код выдачи %s. Хранится до %s.%s', s.name, s.address, o.pickup_code, zakupka._day(v_until),
           case when cardinality(v_short) > 0 then ' Недовоз, вернём ' || zakupka._rub(v_refund) || '.' else '' end),
    '/buyer/orders/' || o.id, 'good');
  if cardinality(v_short) > 0 then
    perform zakupka._notify(zakupka._managers_of(o.distributor_id), format('Недовоз в заказе №%s', o.number),
      format('%s: %s. Покупателю нужно вернуть %s.', s.name, array_to_string(v_short, '; '), zakupka._rub(v_refund)),
      '/distributor/orders/' || o.id, 'warn');
  end if;
end $$;

create or replace function zakupka.issue_order(p_order_id text)
returns void
language plpgsql security definer set search_path = zakupka as $$
declare
  o zakupka.orders := zakupka._get_order(p_order_id);
  v_by text := zakupka._require(o, 'store');
  s zakupka.stores;
  v_shelf numeric;
begin
  perform zakupka._expect(o, 'at_store');
  select * into s from zakupka.stores where id = o.store_id;
  select coalesce(sum(i.qty * coalesce(p.shelf_price, i.price)), 0) into v_shelf
    from zakupka.order_items i left join zakupka.products p on p.id = i.product_id where i.order_id = o.id;
  perform zakupka._log(o.id, 'issued', format('Выдан покупателю, ячейка %s свободна', o.shelf_slot), v_by);
  perform zakupka._notify(array[o.buyer_id], format('Заказ №%s выдан', o.number),
    format('Спасибо! Экономия на этом заказе — %s против полки.', zakupka._rub(greatest(0, v_shelf - o.total))),
    '/buyer/orders/' || o.id, 'good');
  perform zakupka._notify(zakupka._managers_of(o.distributor_id), format('Выдан заказ №%s', o.number),
    format('%s. Плата магазину за выдачу — %s.', s.name, zakupka._rub(s.pickup_fee)),
    '/distributor/orders/' || o.id, 'good');
end $$;

create or replace function zakupka.mark_unclaimed(p_order_id text)
returns void
language plpgsql security definer set search_path = zakupka as $$
declare
  o zakupka.orders := zakupka._get_order(p_order_id);
  v_by text := zakupka._require(o, 'store');
begin
  perform zakupka._expect(o, 'at_store');
  perform zakupka._log(o.id, 'unclaimed', 'Срок хранения истёк, отмечен невыкуп', v_by);
  perform zakupka._notify(array[o.buyer_id], format('Заказ №%s не забрали', o.number),
    'Срок хранения закончился, заказ вернётся поставщику. Напишите в поддержку, если это ошибка.',
    '/buyer/orders/' || o.id, 'warn');
  perform zakupka._notify(zakupka._managers_of(o.distributor_id), format('Невыкуп по заказу №%s', o.number),
    format('%s: заберите следующим рейсом.', (select name from zakupka.stores where id = o.store_id)),
    '/distributor/orders/' || o.id, 'warn');
end $$;

create or replace function zakupka.extend_storage(p_order_id text, p_days int default 1)
returns void
language plpgsql security definer set search_path = zakupka as $$
declare
  o zakupka.orders := zakupka._get_order(p_order_id);
  v_by text := zakupka._require(o, 'store');
  v_until date;
begin
  perform zakupka._expect(o, 'at_store');
  if p_days is null or p_days < 1 or p_days > 14 then perform zakupka._fail('Продлить можно на 1–14 дней'); end if;
  v_until := coalesce(o.stored_until, zakupka._today()) + p_days;
  update zakupka.orders set stored_until = v_until where id = o.id;
  perform zakupka._log(o.id, 'note', 'Хранение продлено до ' || zakupka._day(v_until), v_by);
  perform zakupka._notify(array[o.buyer_id], format('Хранение заказа №%s продлено', o.number),
    format('Магазин подождёт до %s.', zakupka._day(v_until)), '/buyer/orders/' || o.id, 'info');
end $$;

-- ---------------------------------------------------------------------------
-- Админка
-- ---------------------------------------------------------------------------

create or replace function zakupka.resolve_dispute(p_order_id text, p_answer text)
returns void
language plpgsql security definer set search_path = zakupka as $$
declare o zakupka.orders := zakupka._get_order(p_order_id);
begin
  if not zakupka.is_admin() then raise exception 'Только для команды платформы' using errcode = '42501'; end if;
  if o.dispute_text is null then return; end if;
  update zakupka.orders set dispute_resolved = true where id = o.id;
  perform zakupka._log(o.id, 'note', 'Поддержка: ' || p_answer, 'admin');
  perform zakupka._notify(array[o.buyer_id], format('Ответ по заказу №%s', o.number), p_answer,
    '/buyer/orders/' || o.id, 'info');
end $$;

-- attachStaff(userId, storeId | null): привязать сотрудника к магазину или вернуть в покупатели
create or replace function zakupka.attach_staff(p_user_id uuid, p_store_id text default null)
returns void
language plpgsql security definer set search_path = zakupka as $$
begin
  if not zakupka.is_admin() then raise exception 'Только для команды платформы' using errcode = '42501'; end if;
  update zakupka.profiles
     set role = case when p_store_id is null then 'buyer' else 'store' end::zakupka.user_role,
         store_id = p_store_id
   where id = p_user_id;
  if not found then perform zakupka._fail('Пользователь не найден'); end if;
  if p_store_id is not null then
    perform zakupka._notify(array[p_user_id], 'Вас привязали к магазину',
      format('%s: теперь в приложении открывается интерфейс продавца.', (select name from zakupka.stores where id = p_store_id)),
      '/store', 'info');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Снимок для клиента: объект в форме DB из src/lib/types.ts.
-- SECURITY INVOKER — каждый видит только то, что разрешает RLS.
-- ---------------------------------------------------------------------------

create or replace function zakupka.get_snapshot()
returns jsonb
language sql stable security invoker set search_path = zakupka as $$
  select jsonb_build_object(
    'version', 0,
    'seq', 0,
    'users', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', p.id, 'role', p.role, 'name', p.name, 'phone', p.phone, 'storeId', p.store_id,
        'distributorId', p.distributor_id, 'favoriteStoreId', p.favorite_store_id)))
      from zakupka.profiles p), '[]'::jsonb),
    'stores', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'address', s.address, 'district', s.district, 'hours', s.hours,
        'x', s.x, 'y', s.y, 'capacity', s.capacity, 'storageDays', s.storage_days, 'pickupFee', s.pickup_fee,
        'active', s.active) order by s.name)
      from zakupka.stores s), '[]'::jsonb),
    'distributors', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'short', d.short, 'about', d.about, 'color', d.color, 'inn', d.inn,
        'hasAcquiring', d.has_acquiring, 'active', d.active) order by d.name)
      from zakupka.distributors d), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'distributorId', r.distributor_id, 'storeId', r.store_id, 'weekdays', to_jsonb(r.weekdays),
        'cutoffHour', r.cutoff_hour, 'minOrder', r.min_order) order by r.id)
      from zakupka.routes r), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', p.id, 'distributorId', p.distributor_id, 'sku', p.sku, 'name', p.name, 'brand', p.brand,
        'category', p.category, 'unit', p.unit, 'pack', p.pack, 'weight', p.weight, 'price', p.price,
        'shelfPrice', p.shelf_price, 'stock', p.stock, 'art', p.art, 'tint', p.tint, 'promo', p.promo,
        'active', p.active)) order by p.distributor_id, p.sku)
      from zakupka.products p), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(zakupka.order_json(o) order by o.created_at desc)
      from zakupka.orders o), '[]'::jsonb),
    'trips', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'distributorId', t.distributor_id, 'date', t.date, 'storeIds', to_jsonb(t.store_ids),
        'driver', t.driver, 'vehicle', t.vehicle, 'status', t.status) order by t.date desc)
      from zakupka.trips t), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', n.id, 'userId', n.user_id, 'at', n.at, 'title', n.title, 'body', n.body, 'href', n.href,
        'read', n.read, 'tone', n.tone)) order by n.at desc)
      from (select * from zakupka.notifications order by at desc limit 200) n), '[]'::jsonb),
    'carts', coalesce((select jsonb_agg(jsonb_build_object('buyerId', c.buyer_id, 'storeId', c.store_id, 'lines', c.lines))
      from (
        select b.buyer_id, (array_agg(b.store_id))[1] as store_id, jsonb_object_agg(b.distributor_id, b.lines) as lines
          from (
            select buyer_id, distributor_id, max(store_id) as store_id,
                   jsonb_agg(jsonb_build_object('productId', product_id, 'qty', qty) order by created_at) as lines
              from zakupka.cart_lines group by buyer_id, distributor_id
          ) b
         group by b.buyer_id
      ) c), '[]'::jsonb)
  )
$$;

