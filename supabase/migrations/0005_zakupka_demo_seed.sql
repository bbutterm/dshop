-- «Закупка»: первичное заполнение демо-данными без удаления (применено через MCP)
-- и флаг, при котором защита профиля пропускает заполнение.

create or replace function zakupka.profiles_guard() returns trigger
language plpgsql set search_path = zakupka as $$
begin
  if coalesce(current_setting('zakupka.seeding', true), '') = '1' then
    return new;
  end if;
  if auth.uid() is not null and not zakupka.is_admin() and (
       new.role is distinct from old.role
    or new.store_id is distinct from old.store_id
    or new.distributor_id is distinct from old.distributor_id
    or new.phone is distinct from old.phone
    or new.id is distinct from old.id) then
    raise exception 'Недостаточно прав для изменения профиля' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function zakupka._seeding() returns void
language sql as $$ select set_config('zakupka.seeding', '1', true) $$;
revoke execute on function zakupka._seeding() from public, anon, authenticated;

-- Только если в «Закупке» ещё нет магазинов. Ничего не удаляет.
create or replace function zakupka.demo_seed(p_db jsonb) returns boolean
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
      raise exception 'Заполнение доступно только демо-аккаунтам' using errcode = '42501';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('zakupka:demo_seed'));
  if exists (select 1 from zakupka.stores) then
    return false;
  end if;

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
    from jsonb_array_elements(p_db -> 'users') u
  on conflict (id) do update set role = excluded.role, name = excluded.name, phone = excluded.phone,
    store_id = excluded.store_id, distributor_id = excluded.distributor_id, favorite_store_id = excluded.favorite_store_id;

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
  return true;
end $$;

revoke execute on function zakupka.demo_seed(jsonb) from public, anon, authenticated;

create or replace function public.zk_demo_seed(p_db jsonb) returns boolean
language sql security definer set search_path = '' as $$
  select zakupka._seeding();
  select zakupka.demo_seed(p_db);
$$;
revoke execute on function public.zk_demo_seed(jsonb) from public, anon;
grant execute on function public.zk_demo_seed(jsonb) to authenticated;
