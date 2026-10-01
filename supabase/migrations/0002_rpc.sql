-- «Закупка»: команды жизненного цикла заказа. Повторяют src/lib/engine.ts:
-- те же имена (snake_case), те же допустимые переходы статусов (expect(...)),
-- та же история (order_events) и уведомления. Клиент: supabase.rpc('<имя>', {p_...}).
-- Ошибки предметной области — raise exception ... using errcode = 'P0001' (текст для тоста).

-- ---------------------------------------------------------------------------
-- Служебные функции (недоступны клиенту, см. revoke в конце файла)
-- ---------------------------------------------------------------------------

-- «Сегодня» в часовом поясе пилота (Брянск)
create or replace function public._today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Moscow')::date $$;

-- 1290 → «1 290 ₽»
create or replace function public._rub(n numeric) returns text
language sql immutable as $$ select replace(to_char(round(n), 'FM999,999,990'), ',', ' ') || ' ₽' $$;

-- 2026-10-03 → «03.10»
create or replace function public._day(d date) returns text
language sql immutable as $$ select to_char(d, 'DD.MM') $$;

create or replace function public._fail(msg text) returns void
language plpgsql as $$ begin raise exception '%', msg using errcode = 'P0001'; end $$;

-- delivery.ts nextDeliveryDates: ближайшие даты привоза; на завтра — только до cutoff_hour сегодня
create or replace function public.next_delivery_dates(p_weekdays smallint[], p_cutoff smallint, p_count int default 3)
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

create or replace function public._managers_of(p_distributor_id text) returns uuid[]
language sql stable as $$
  select coalesce(array_agg(id), '{}') from public.profiles where role = 'distributor' and distributor_id = p_distributor_id
$$;

create or replace function public._staff_of(p_store_id text) returns uuid[]
language sql stable as $$
  select coalesce(array_agg(id), '{}') from public.profiles where role = 'store' and store_id = p_store_id
$$;

create or replace function public._admins() returns uuid[]
language sql stable as $$
  select coalesce(array_agg(id), '{}') from public.profiles where role = 'admin'
$$;

create or replace function public._notify(p_users uuid[], p_title text, p_body text, p_href text, p_tone text default 'info')
returns void
language sql as $$
  insert into public.notifications (user_id, title, body, href, tone)
  select u, p_title, p_body, p_href, p_tone from unnest(p_users) as u
$$;

-- engine.log: запись в историю + смена статуса (кроме 'note')
create or replace function public._log(p_order_id text, p_status text, p_text text, p_by text)
returns void
language plpgsql as $$
begin
  insert into public.order_events (order_id, status, text, by_role, actor_id)
  values (p_order_id, p_status, p_text, p_by, auth.uid());
  if p_status = 'note' then
    update public.orders set updated_at = now() where id = p_order_id;
  else
    update public.orders set status = p_status::public.order_status where id = p_order_id;
  end if;
end $$;

-- getOrder + блокировка строки
create or replace function public._get_order(p_order_id text) returns public.orders
language plpgsql as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then perform public._fail('Заказ не найден'); end if;
  return o;
end $$;

-- engine.expect
create or replace function public._expect(o public.orders, variadic allowed public.order_status[]) returns void
language plpgsql as $$
begin
  if not (o.status = any (allowed)) then
    perform public._fail(format('Действие недоступно в статусе «%s»', case o.status
      when 'awaiting_payment' then 'ждёт оплаты' when 'placed' then 'оформлен'
      when 'confirmed' then 'подтверждён' when 'assembled' then 'собран'
      when 'in_transit' then 'в пути' when 'at_store' then 'в магазине'
      when 'issued' then 'выдан' when 'unclaimed' then 'невыкуп'
      when 'returned' then 'возвращён' when 'cancelled' then 'отменён' end));
  end if;
end $$;

-- Проверка прав на заказ. who: 'buyer' | 'store' | 'distributor'; админ проходит всегда.
-- Возвращает роль, от имени которой пишется история.
create or replace function public._require(o public.orders, variadic who text[]) returns text
language plpgsql stable as $$
declare r public.user_role := public.auth_role();
begin
  if r is null then
    raise exception 'Требуется вход' using errcode = '42501';
  end if;
  if r = 'admin' then return 'admin'; end if;
  if r::text = any (who) and (
       (r = 'buyer' and o.buyer_id = auth.uid())
    or (r = 'store' and o.store_id = public.auth_store_id())
    or (r = 'distributor' and o.distributor_id = public.auth_distributor_id())) then
    return r::text;
  end if;
  raise exception 'Нет доступа к заказу' using errcode = '42501';
end $$;

-- Order в форме src/lib/types.ts (camelCase, отсутствующие поля без null)
create or replace function public.order_json(o public.orders) returns jsonb
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
      from public.order_items i where i.order_id = o.id), '[]'::jsonb),
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
      from public.order_events e where e.order_id = o.id), '[]'::jsonb),
    'dispute', case when o.dispute_text is not null then
      jsonb_build_object('text', o.dispute_text, 'at', o.dispute_at, 'resolved', coalesce(o.dispute_resolved, false)) end
  ))
$$;

create or replace function public._order_json(p_order_id text) returns jsonb
language sql stable as $$ select public.order_json(o) from public.orders o where o.id = p_order_id $$;

-- ---------------------------------------------------------------------------
-- Покупатель
-- ---------------------------------------------------------------------------

-- placeOrder(buyerId, distributorId, deliveryDate): покупатель = auth.uid(), p_buyer_id игнорируется
create or replace function public.place_order(p_distributor_id text, p_delivery_date date, p_buyer_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_buyer uuid := auth.uid();
  v_store text;
  r public.routes;
  d public.distributors;
  l record;
  v_total numeric := 0;
  v_pos smallint := 0;
  v_id text;
  v_num integer;
begin
  if public.auth_role() is distinct from 'buyer' then
    raise exception 'Заказ оформляет покупатель' using errcode = '42501';
  end if;
  if p_buyer_id is not null and p_buyer_id <> v_buyer then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  select store_id into v_store from public.cart_lines
   where buyer_id = v_buyer and distributor_id = p_distributor_id
   order by updated_at desc limit 1;
  if v_store is null then perform public._fail('Корзина этого поставщика пуста'); end if;

  select * into r from public.routes where distributor_id = p_distributor_id and store_id = v_store;
  if not found then perform public._fail('Поставщик не возит в выбранный магазин'); end if;
  if not (p_delivery_date = any (public.next_delivery_dates(r.weekdays, r.cutoff_hour, 6))) then
    perform public._fail('На эту дату заказ уже не принимается');
  end if;

  for l in
    select c.qty, p.* from public.cart_lines c join public.products p on p.id = c.product_id
     where c.buyer_id = v_buyer and c.distributor_id = p_distributor_id
     order by c.created_at
  loop
    if not l.active then perform public._fail(format('«%s» снят с продажи', l.name)); end if;
    if l.stock < l.qty then perform public._fail(format('«%s»: на складе %s %s', l.name, l.stock, l.unit)); end if;
    v_total := v_total + l.qty * l.price;
  end loop;
  if v_total < r.min_order then
    perform public._fail('Минимальный заказ у поставщика — ' || public._rub(r.min_order));
  end if;

  select * into d from public.distributors where id = p_distributor_id;
  v_num := nextval('public.order_number_seq');
  insert into public.orders (number, buyer_id, distributor_id, store_id, delivery_date, status, total, label, payment_method)
  values (v_num, v_buyer, p_distributor_id, v_store, p_delivery_date, 'awaiting_payment', v_total,
          d.short || '-' || v_num, case when d.has_acquiring then 'card_link' else 'agent_cash' end)
  returning id into v_id;

  for l in
    select c.qty, p.* from public.cart_lines c join public.products p on p.id = c.product_id
     where c.buyer_id = v_buyer and c.distributor_id = p_distributor_id
     order by c.created_at
  loop
    insert into public.order_items (order_id, product_id, position, name, unit, price, qty)
    values (v_id, l.id, v_pos, l.name, l.unit, l.price, l.qty);
    v_pos := v_pos + 1;
  end loop;

  perform public._log(v_id, 'awaiting_payment', 'Заказ создан, ожидает оплаты', 'buyer');
  return public._order_json(v_id);
end $$;

-- payOrder: заглушка эквайринга. В проде статус меняет вебхук платёжки (service_role).
create or replace function public.pay_order(p_order_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o public.orders := public._get_order(p_order_id);
  s public.stores;
  v_receipt text := 'ФД ' || (10000 + floor(random() * 89999))::int;
  v_lines int;
begin
  perform public._require(o, 'buyer');
  perform public._expect(o, 'awaiting_payment');

  update public.orders set paid_at = now(), receipt_no = v_receipt where id = o.id;
  update public.products p set stock = greatest(0, p.stock - i.qty)
    from public.order_items i where i.order_id = o.id and p.id = i.product_id;
  delete from public.cart_lines where buyer_id = o.buyer_id and distributor_id = o.distributor_id;
  perform public._log(o.id, 'placed', format('Оплачено %s, чек %s отправлен в СМС', public._rub(o.total), v_receipt), 'buyer');

  select * into s from public.stores where id = o.store_id;
  select count(*) into v_lines from public.order_items where order_id = o.id;
  perform public._notify(array[o.buyer_id], format('Заказ №%s оплачен', o.number),
    format('Чек пришёл в СМС. Привоз %s, %s.', public._day(o.delivery_date), s.name),
    '/buyer/orders/' || o.id, 'good');
  perform public._notify(public._managers_of(o.distributor_id), format('Новый заказ №%s · %s', o.number, public._rub(o.total)),
    format('Позиций: %s, %s, привоз %s. Нужно подтвердить.', v_lines, s.name, public._day(o.delivery_date)),
    '/distributor/orders/' || o.id, 'info');
  return public._order_json(o.id);
end $$;

-- Общая часть отмены (engine.cancelOrder), без проверки прав
create or replace function public._cancel(o public.orders, p_by text, p_reason text)
returns void
language plpgsql as $$
declare v_paid boolean := o.status = 'placed';
begin
  perform public._expect(o, 'awaiting_payment', 'placed');
  if v_paid then
    update public.orders set refund = total where id = o.id;
    update public.products p set stock = p.stock + i.qty
      from public.order_items i where i.order_id = o.id and p.id = i.product_id;
  end if;
  perform public._log(o.id, 'cancelled',
    case when p_by = 'buyer' then 'Покупатель отменил заказ'
         else 'Отклонён: ' || coalesce(nullif(p_reason, ''), 'без причины') end, p_by);
  if p_by = 'buyer' and v_paid then
    perform public._notify(public._managers_of(o.distributor_id), format('Заказ №%s отменён покупателем', o.number),
      format('Возврат %s по ссылке оплаты.', public._rub(o.total)), '/distributor/orders/' || o.id, 'warn');
  end if;
  if p_by <> 'buyer' then
    perform public._notify(array[o.buyer_id], format('Заказ №%s отклонён поставщиком', o.number),
      format('%s. Деньги %s вернутся на карту.', coalesce(nullif(p_reason, ''), 'Поставщик не сможет привезти заказ'),
             public._rub(o.total)), '/buyer/orders/' || o.id, 'warn');
  end if;
end $$;

-- cancelOrder(orderId, by, reason): роль берётся из профиля, p_by только для совместимости сигнатуры
create or replace function public.cancel_order(p_order_id text, p_by text default null, p_reason text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders := public._get_order(p_order_id);
  v_by text := public._require(o, 'buyer', 'distributor');
begin
  perform public._cancel(o, v_by, p_reason);
end $$;

create or replace function public.open_dispute(p_order_id text, p_text text)
returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders := public._get_order(p_order_id);
begin
  perform public._require(o, 'buyer');
  if coalesce(trim(p_text), '') = '' then perform public._fail('Опишите проблему'); end if;
  update public.orders set dispute_text = p_text, dispute_at = now(), dispute_resolved = false where id = o.id;
  perform public._log(o.id, 'note', format('Покупатель открыл обращение: «%s»', p_text), 'buyer');
  perform public._notify(public._admins(), format('Обращение по заказу №%s', o.number), p_text,
    '/admin/orders?open=' || o.id, 'warn');
end $$;

-- ---------------------------------------------------------------------------
-- Дистрибьютор
-- ---------------------------------------------------------------------------

-- confirmOrder(orderId, qty): p_qty = {"<productId>": <кол-во>}, не указанные — полностью
create or replace function public.confirm_order(p_order_id text, p_qty jsonb default '{}')
returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders := public._get_order(p_order_id);
  v_by text := public._require(o, 'distributor');
  it record;
  q int;
  v_missing text[] := '{}';
  v_confirmed numeric;
  v_refund numeric;
begin
  perform public._expect(o, 'placed');
  for it in select * from public.order_items where order_id = o.id order by position loop
    q := greatest(0, least(it.qty, coalesce((p_qty ->> it.product_id)::int, it.qty)));
    update public.order_items set confirmed_qty = q where order_id = o.id and product_id = it.product_id;
    if q < it.qty then
      v_missing := v_missing || format('%s — %s из %s', it.name, q, it.qty);
      update public.products set stock = stock + (it.qty - q) where id = it.product_id;
    end if;
  end loop;

  select coalesce(sum(confirmed_qty * price), 0) into v_confirmed from public.order_items where order_id = o.id;
  if v_confirmed = 0 then
    perform public._cancel(o, v_by, 'Ни одной позиции нет в наличии');
    return;
  end if;

  v_refund := o.total - v_confirmed;
  update public.orders set refund = v_refund where id = o.id;
  perform public._log(o.id, 'confirmed',
    case when cardinality(v_missing) > 0 then 'Подтверждён частично, возврат ' || public._rub(v_refund)
         else 'Подтверждён полностью' end, v_by);
  if cardinality(v_missing) > 0 then
    perform public._notify(array[o.buyer_id], format('Заказ №%s подтверждён частично', o.number),
      format('Нет в наличии: %s. Вернём %s на карту.', array_to_string(v_missing, '; '), public._rub(v_refund)),
      '/buyer/orders/' || o.id, 'warn');
  else
    perform public._notify(array[o.buyer_id], format('Заказ №%s подтверждён', o.number),
      format('Поставщик собирает заказ к %s.', public._day(o.delivery_date)), '/buyer/orders/' || o.id, 'good');
  end if;
end $$;

create or replace function public.assemble_orders(p_order_ids text[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id text;
  o public.orders;
  v_by text;
begin
  foreach v_id in array p_order_ids loop
    o := public._get_order(v_id);
    v_by := public._require(o, 'distributor');
    perform public._expect(o, 'confirmed');
    perform public._log(o.id, 'assembled', 'Собран и промаркирован: ' || o.label, v_by);
  end loop;
end $$;

-- dispatchTrip: собранные заказы на дату уезжают в магазины
create or replace function public.dispatch_trip(p_distributor_id text, p_date date, p_driver text, p_vehicle text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role := public.auth_role();
  v_by text;
  t public.trips;
  d public.distributors;
  o public.orders;
  v_store text;
  n int;
  v_back int;
begin
  if v_role = 'admin' then v_by := 'admin';
  elsif v_role = 'distributor' and p_distributor_id = public.auth_distributor_id() then v_by := 'distributor';
  else raise exception 'Нет доступа' using errcode = '42501';
  end if;

  perform 1 from public.orders
   where distributor_id = p_distributor_id and delivery_date = p_date and status = 'assembled'
   for update;
  if not found then perform public._fail('Нет собранных заказов на эту дату'); end if;

  insert into public.trips (distributor_id, date, store_ids, driver, vehicle, status)
  select p_distributor_id, p_date, array_agg(distinct store_id order by store_id), coalesce(p_driver, ''), coalesce(p_vehicle, ''), 'on_road'
    from public.orders
   where distributor_id = p_distributor_id and delivery_date = p_date and status = 'assembled'
  returning * into t;

  select * into d from public.distributors where id = p_distributor_id;

  for o in
    select * from public.orders
     where distributor_id = p_distributor_id and delivery_date = p_date and status = 'assembled'
  loop
    update public.orders set trip_id = t.id where id = o.id;
    perform public._log(o.id, 'in_transit', 'Едет с поставкой, ' || coalesce(p_vehicle, ''), v_by);
    perform public._notify(array[o.buyer_id], format('Заказ №%s в пути', o.number),
      format('Едет в %s с обычной поставкой. Пришлём код, как только магазин примет.',
             (select name from public.stores where id = o.store_id)),
      '/buyer/orders/' || o.id, 'info');
  end loop;

  foreach v_store in array t.store_ids loop
    select count(*) into n from public.orders where trip_id = t.id and store_id = v_store;
    select count(*) into v_back from public.orders
     where store_id = v_store and distributor_id = p_distributor_id and status = 'unclaimed';
    perform public._notify(public._staff_of(v_store), format('%s: едет заказов — %s', d.name, n),
      format('Поставка %s, %s.%s', public._day(p_date), coalesce(p_vehicle, ''),
             case when v_back > 0 then format(' Водитель заберёт невыкуп: %s.', v_back) else '' end),
      '/store/incoming', 'info');
  end loop;

  return jsonb_build_object('id', t.id, 'distributorId', t.distributor_id, 'date', t.date, 'storeIds', to_jsonb(t.store_ids),
                            'driver', t.driver, 'vehicle', t.vehicle, 'status', t.status);
end $$;

create or replace function public.return_unclaimed(p_order_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders := public._get_order(p_order_id);
  v_by text := public._require(o, 'distributor');
begin
  perform public._expect(o, 'unclaimed');
  perform public._log(o.id, 'returned', 'Невыкуп забран поставщиком', v_by);
  update public.products p set stock = p.stock + coalesce(i.received_qty, i.confirmed_qty, i.qty)
    from public.order_items i where i.order_id = o.id and p.id = i.product_id;
end $$;

-- importPrice(distributorId, rows): rows = [{sku, name, price, unit?, stock?, category?, brand?, weight?, shelfPrice?}]
create or replace function public.import_price(p_distributor_id text, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_updated int := 0;
  v_added int := 0;
  v_unit text;
  h int;
  arts text[] := array['box', 'bag', 'pack', 'jar', 'can', 'bar', 'bottle', 'tin'];
  tints text[] := array['#B8322A', '#2F6FB0', '#D8913A', '#4E6B2A', '#6B3A1E', '#E2B33B', '#7B2B3A', '#2D5D8C'];
begin
  if not (public.is_admin() or p_distributor_id = public.auth_distributor_id()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    update public.products set
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
      insert into public.products (distributor_id, sku, name, brand, category, unit, pack, weight,
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
create or replace function public._free_slot(p_store_id text) returns text
language plpgsql stable as $$
declare
  rws text := 'АБВГДЕЖ';
  s text;
begin
  for ri in 1..length(rws) loop
    for i in 1..8 loop
      s := substr(rws, ri, 1) || '-' || lpad(i::text, 2, '0');
      if not exists (select 1 from public.orders
                      where store_id = p_store_id and status in ('at_store', 'unclaimed') and shelf_slot = s) then
        return s;
      end if;
    end loop;
  end loop;
  return 'пол';
end $$;

-- receiveOrder(orderId, received?): p_received = {"<productId>": <кол-во>} или null — всё приехало
create or replace function public.receive_order(p_order_id text, p_received jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders := public._get_order(p_order_id);
  v_by text := public._require(o, 'store');
  s public.stores;
  it record;
  conf int;
  q int;
  v_short text[] := '{}';
  v_received numeric;
  v_refund numeric;
  v_slot text;
  v_until date;
begin
  perform public._expect(o, 'in_transit');
  select * into s from public.stores where id = o.store_id;
  -- сериализуем выдачу ячеек в пределах магазина
  perform pg_advisory_xact_lock(hashtext('slot:' || o.store_id));

  for it in select * from public.order_items where order_id = o.id order by position loop
    conf := coalesce(it.confirmed_qty, it.qty);
    q := greatest(0, least(conf, coalesce((p_received ->> it.product_id)::int, conf)));
    update public.order_items set received_qty = q where order_id = o.id and product_id = it.product_id;
    if q < conf then v_short := v_short || format('%s — %s из %s', it.name, q, conf); end if;
  end loop;

  select coalesce(sum(received_qty * price), 0) into v_received from public.order_items where order_id = o.id;
  v_refund := o.total - v_received;
  v_slot := public._free_slot(o.store_id);
  v_until := public._today() + s.storage_days;
  update public.orders set refund = v_refund, shelf_slot = v_slot, stored_until = v_until where id = o.id;

  perform public._log(o.id, 'at_store',
    case when cardinality(v_short) > 0
         then format('Принят с недовозом (%s), ячейка %s', array_to_string(v_short, '; '), v_slot)
         else 'Принят магазином, ячейка ' || v_slot end, v_by);
  perform public._notify(array[o.buyer_id], format('Заказ №%s ждёт вас', o.number),
    format('%s, %s. Код выдачи %s. Хранится до %s.%s', s.name, s.address, o.pickup_code, public._day(v_until),
           case when cardinality(v_short) > 0 then ' Недовоз, вернём ' || public._rub(v_refund) || '.' else '' end),
    '/buyer/orders/' || o.id, 'good');
  if cardinality(v_short) > 0 then
    perform public._notify(public._managers_of(o.distributor_id), format('Недовоз в заказе №%s', o.number),
      format('%s: %s. Покупателю нужно вернуть %s.', s.name, array_to_string(v_short, '; '), public._rub(v_refund)),
      '/distributor/orders/' || o.id, 'warn');
  end if;
end $$;

create or replace function public.issue_order(p_order_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders := public._get_order(p_order_id);
  v_by text := public._require(o, 'store');
  s public.stores;
  v_shelf numeric;
begin
  perform public._expect(o, 'at_store');
  select * into s from public.stores where id = o.store_id;
  select coalesce(sum(i.qty * coalesce(p.shelf_price, i.price)), 0) into v_shelf
    from public.order_items i left join public.products p on p.id = i.product_id where i.order_id = o.id;
  perform public._log(o.id, 'issued', format('Выдан покупателю, ячейка %s свободна', o.shelf_slot), v_by);
  perform public._notify(array[o.buyer_id], format('Заказ №%s выдан', o.number),
    format('Спасибо! Экономия на этом заказе — %s против полки.', public._rub(greatest(0, v_shelf - o.total))),
    '/buyer/orders/' || o.id, 'good');
  perform public._notify(public._managers_of(o.distributor_id), format('Выдан заказ №%s', o.number),
    format('%s. Плата магазину за выдачу — %s.', s.name, public._rub(s.pickup_fee)),
    '/distributor/orders/' || o.id, 'good');
end $$;

create or replace function public.mark_unclaimed(p_order_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders := public._get_order(p_order_id);
  v_by text := public._require(o, 'store');
begin
  perform public._expect(o, 'at_store');
  perform public._log(o.id, 'unclaimed', 'Срок хранения истёк, отмечен невыкуп', v_by);
  perform public._notify(array[o.buyer_id], format('Заказ №%s не забрали', o.number),
    'Срок хранения закончился, заказ вернётся поставщику. Напишите в поддержку, если это ошибка.',
    '/buyer/orders/' || o.id, 'warn');
  perform public._notify(public._managers_of(o.distributor_id), format('Невыкуп по заказу №%s', o.number),
    format('%s: заберите следующим рейсом.', (select name from public.stores where id = o.store_id)),
    '/distributor/orders/' || o.id, 'warn');
end $$;

create or replace function public.extend_storage(p_order_id text, p_days int default 1)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders := public._get_order(p_order_id);
  v_by text := public._require(o, 'store');
  v_until date;
begin
  perform public._expect(o, 'at_store');
  if p_days is null or p_days < 1 or p_days > 14 then perform public._fail('Продлить можно на 1–14 дней'); end if;
  v_until := coalesce(o.stored_until, public._today()) + p_days;
  update public.orders set stored_until = v_until where id = o.id;
  perform public._log(o.id, 'note', 'Хранение продлено до ' || public._day(v_until), v_by);
  perform public._notify(array[o.buyer_id], format('Хранение заказа №%s продлено', o.number),
    format('Магазин подождёт до %s.', public._day(v_until)), '/buyer/orders/' || o.id, 'info');
end $$;

-- ---------------------------------------------------------------------------
-- Админка
-- ---------------------------------------------------------------------------

create or replace function public.resolve_dispute(p_order_id text, p_answer text)
returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders := public._get_order(p_order_id);
begin
  if not public.is_admin() then raise exception 'Только для команды платформы' using errcode = '42501'; end if;
  if o.dispute_text is null then return; end if;
  update public.orders set dispute_resolved = true where id = o.id;
  perform public._log(o.id, 'note', 'Поддержка: ' || p_answer, 'admin');
  perform public._notify(array[o.buyer_id], format('Ответ по заказу №%s', o.number), p_answer,
    '/buyer/orders/' || o.id, 'info');
end $$;

-- attachStaff(userId, storeId | null): привязать сотрудника к магазину или вернуть в покупатели
create or replace function public.attach_staff(p_user_id uuid, p_store_id text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для команды платформы' using errcode = '42501'; end if;
  update public.profiles
     set role = case when p_store_id is null then 'buyer' else 'store' end::public.user_role,
         store_id = p_store_id
   where id = p_user_id;
  if not found then perform public._fail('Пользователь не найден'); end if;
  if p_store_id is not null then
    perform public._notify(array[p_user_id], 'Вас привязали к магазину',
      format('%s: теперь в приложении открывается интерфейс продавца.', (select name from public.stores where id = p_store_id)),
      '/store', 'info');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Снимок для клиента: объект в форме DB из src/lib/types.ts.
-- SECURITY INVOKER — каждый видит только то, что разрешает RLS.
-- ---------------------------------------------------------------------------

create or replace function public.get_snapshot()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'version', 0,
    'seq', 0,
    'users', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', p.id, 'role', p.role, 'name', p.name, 'phone', p.phone, 'storeId', p.store_id,
        'distributorId', p.distributor_id, 'favoriteStoreId', p.favorite_store_id)))
      from public.profiles p), '[]'::jsonb),
    'stores', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'address', s.address, 'district', s.district, 'hours', s.hours,
        'x', s.x, 'y', s.y, 'capacity', s.capacity, 'storageDays', s.storage_days, 'pickupFee', s.pickup_fee,
        'active', s.active) order by s.name)
      from public.stores s), '[]'::jsonb),
    'distributors', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'short', d.short, 'about', d.about, 'color', d.color, 'inn', d.inn,
        'hasAcquiring', d.has_acquiring, 'active', d.active) order by d.name)
      from public.distributors d), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'distributorId', r.distributor_id, 'storeId', r.store_id, 'weekdays', to_jsonb(r.weekdays),
        'cutoffHour', r.cutoff_hour, 'minOrder', r.min_order) order by r.id)
      from public.routes r), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', p.id, 'distributorId', p.distributor_id, 'sku', p.sku, 'name', p.name, 'brand', p.brand,
        'category', p.category, 'unit', p.unit, 'pack', p.pack, 'weight', p.weight, 'price', p.price,
        'shelfPrice', p.shelf_price, 'stock', p.stock, 'art', p.art, 'tint', p.tint, 'promo', p.promo,
        'active', p.active)) order by p.distributor_id, p.sku)
      from public.products p), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(public.order_json(o) order by o.created_at desc)
      from public.orders o), '[]'::jsonb),
    'trips', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'distributorId', t.distributor_id, 'date', t.date, 'storeIds', to_jsonb(t.store_ids),
        'driver', t.driver, 'vehicle', t.vehicle, 'status', t.status) order by t.date desc)
      from public.trips t), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', n.id, 'userId', n.user_id, 'at', n.at, 'title', n.title, 'body', n.body, 'href', n.href,
        'read', n.read, 'tone', n.tone)) order by n.at desc)
      from (select * from public.notifications order by at desc limit 200) n), '[]'::jsonb),
    'carts', coalesce((select jsonb_agg(jsonb_build_object('buyerId', c.buyer_id, 'storeId', c.store_id, 'lines', c.lines))
      from (
        select b.buyer_id, (array_agg(b.store_id))[1] as store_id, jsonb_object_agg(b.distributor_id, b.lines) as lines
          from (
            select buyer_id, distributor_id, max(store_id) as store_id,
                   jsonb_agg(jsonb_build_object('productId', product_id, 'qty', qty) order by created_at) as lines
              from public.cart_lines group by buyer_id, distributor_id
          ) b
         group by b.buyer_id
      ) c), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------------
-- Права: служебные функции клиенту недоступны, команды — только вошедшим
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;

revoke execute on function
  public._today(), public._rub(numeric), public._day(date), public._fail(text),
  public._managers_of(text), public._staff_of(text), public._admins(),
  public._notify(uuid[], text, text, text, text), public._log(text, text, text, text),
  public._get_order(text), public._expect(public.orders, public.order_status[]),
  public._require(public.orders, text[]), public._order_json(text), public._cancel(public.orders, text, text),
  public._free_slot(text), public.handle_new_user(), public.cart_lines_before(), public.cart_lines_sync_store(),
  public.set_updated_at(), public.profiles_guard()
from authenticated;

grant execute on function
  public.auth_role(), public.auth_store_id(), public.auth_distributor_id(), public.is_admin(),
  public.next_delivery_dates(smallint[], smallint, int), public.order_json(public.orders), public.get_snapshot(),
  public.place_order(text, date, uuid), public.pay_order(text), public.cancel_order(text, text, text),
  public.open_dispute(text, text), public.confirm_order(text, jsonb), public.assemble_orders(text[]),
  public.dispatch_trip(text, date, text, text), public.return_unclaimed(text), public.import_price(text, jsonb),
  public.receive_order(text, jsonb), public.issue_order(text), public.mark_unclaimed(text),
  public.extend_storage(text, int), public.resolve_dispute(text, text), public.attach_staff(uuid, text)
to authenticated;
