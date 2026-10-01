-- «Закупка»: справочные данные пилота (из src/lib/seed.ts и src/lib/catalog.ts).
-- Заказов и пользователей здесь нет. Идемпотентно: повторный запуск обновляет справочники.
--
-- Демо-пользователи создаются входом по телефону (Supabase Auth → Phone).
-- Для демо удобно завести тестовые номера (Auth → Providers → Phone → Test phone numbers, OTP 123456):
--   79101234567 Анна (покупатель), 79107654321 Татьяна («Ромашка»),
--   79051112233 Сергей (Деснапродукт), 79000000000 Команда «Закупки» (админ),
--   79052223344 Олег (Бакалея-32), 79201110000 Нина («Рядом»), 79201110001 Виктор (у Сергеича).
-- После первого входа триггер on_auth_user_created создаёт профиль покупателя; роли выдаём так
-- (SQL Editor, под postgres — триггер profiles_guard это разрешает):
--
--   update profiles set name = 'Анна Соколова', favorite_store_id = 's-romashka' where phone = '79101234567';
--   update profiles set name = 'Татьяна Ивановна', role = 'store', store_id = 's-romashka' where phone = '79107654321';
--   update profiles set name = 'Сергей Кольцов', role = 'distributor', distributor_id = 'd-desna' where phone = '79051112233';
--   update profiles set name = 'Команда «Закупки»', role = 'admin' where phone = '79000000000';
--   update profiles set name = 'Олег Панин', role = 'distributor', distributor_id = 'd-b32' where phone = '79052223344';
--   update profiles set name = 'Нина Петрова', role = 'store', store_id = 's-ryadom' where phone = '79201110000';
--   update profiles set name = 'Виктор Сергеевич', role = 'store', store_id = 's-sergeich' where phone = '79201110001';

insert into public.stores (id, name, address, district, hours, x, y, capacity, storage_days, pickup_fee, active) values
  ('s-romashka', '«Ромашка»', 'ул. Ромашина, 32', 'Советский район', '8:00–22:00', 38, 34, 24, 3, 25, true),
  ('s-ryadom', 'Минимаркет «Рядом»', 'ул. Бежицкая, 1/4', 'Бежицкий район', '7:00–23:00', 64, 22, 16, 3, 25, true),
  ('s-sergeich', 'Продукты у Сергеича', 'пр-т Станке Димитрова, 67', 'Советский район', '9:00–21:00', 52, 62, 12, 2, 20, true),
  ('s-volna', '«Волна»', 'ул. Литейная, 50', 'Володарский район', '8:00–21:00', 22, 72, 14, 3, 25, false)
on conflict (id) do update set
  name = excluded.name, address = excluded.address, district = excluded.district, hours = excluded.hours,
  x = excluded.x, y = excluded.y, capacity = excluded.capacity, storage_days = excluded.storage_days,
  pickup_fee = excluded.pickup_fee, active = excluded.active;

insert into public.distributors (id, name, short, about, color, inn, has_acquiring, active) values
  ('d-desna', 'ТД «Деснапродукт»', 'DP', 'Кондитерка, чай. Склад на ул. Транспортной, свои машины по Брянску.', '#B8322A', '3250012345', true, true),
  ('d-b32', 'Бакалея-32', 'B32', 'Крупы, макароны, масло, консервы, кофе. Возит по Советскому району.', '#1F5FA8', '3257098765', true, true)
on conflict (id) do update set
  name = excluded.name, short = excluded.short, about = excluded.about, color = excluded.color,
  inn = excluded.inn, has_acquiring = excluded.has_acquiring, active = excluded.active;

-- weekdays: 1..7 = пн..вс
insert into public.routes (id, distributor_id, store_id, weekdays, cutoff_hour, min_order) values
  ('r-1', 'd-desna', 's-romashka', '{2,5}', 18, 1500),
  ('r-2', 'd-desna', 's-ryadom', '{3,6}', 18, 1500),
  ('r-3', 'd-desna', 's-sergeich', '{2,5}', 18, 2000),
  ('r-4', 'd-b32', 's-romashka', '{1,4}', 16, 2000),
  ('r-5', 'd-b32', 's-sergeich', '{3,6}', 16, 2000)
on conflict (id) do update set
  distributor_id = excluded.distributor_id, store_id = excluded.store_id, weekdays = excluded.weekdays,
  cutoff_hour = excluded.cutoff_hour, min_order = excluded.min_order;

-- Остатки — те же, что генерирует createSeed() (rng(42)); «Алёнка» (p-d5) почти закончилась
insert into public.products
  (id, distributor_id, sku, name, brand, category, unit, pack, weight, price, shelf_price, stock, art, tint, promo) values
  ('p-d0', 'd-desna', 'DP-0101', 'Конфеты «Птичье молоко»', 'Брянконфи', 'Конфеты', 'кор', 1, '1 кг', 489, 629, 35, 'box', '#2F6FB0', null),
  ('p-d1', 'd-desna', 'DP-0102', 'Конфеты «Красный мак»', 'Красный Октябрь', 'Конфеты', 'кор', 1, '1 кг', 742, 960, 25, 'box', '#B8322A', null),
  ('p-d2', 'd-desna', 'DP-0103', 'Ирис «Кис-кис»', 'Рот Фронт', 'Конфеты', 'уп', 1, '1 кг', 318, 415, 54, 'bag', '#D8913A', null),
  ('p-d3', 'd-desna', 'DP-0104', 'Конфеты «Коровка» с вафлей', 'Рот Фронт', 'Конфеты', 'уп', 1, '1 кг', 405, 540, 33, 'bag', '#E9DDB8', '−8 % до воскресенья'),
  ('p-d4', 'd-desna', 'DP-0201', 'Шоколад горький 72 %', 'Бабаевский', 'Шоколад', 'уп', 5, '5 × 90 г', 512, 690, 42, 'bar', '#4A2E22', null),
  ('p-d5', 'd-desna', 'DP-0202', 'Шоколад молочный «Алёнка»', 'Красный Октябрь', 'Шоколад', 'уп', 6, '6 × 90 г', 498, 654, 3, 'bar', '#E2B33B', null),
  ('p-d6', 'd-desna', 'DP-0203', 'Шоколад с цельным фундуком', 'Коркунов', 'Шоколад', 'уп', 4, '4 × 90 г', 556, 760, 46, 'bar', '#7B2B3A', null),
  ('p-d7', 'd-desna', 'DP-0301', 'Печенье «Юбилейное» традиционное', 'Юбилейное', 'Печенье', 'уп', 6, '6 × 112 г', 306, 402, 27, 'pack', '#2E5FA8', null),
  ('p-d8', 'd-desna', 'DP-0302', 'Печенье овсяное', 'Брянконфи', 'Печенье', 'кор', 1, '2 кг', 398, 520, 72, 'box', '#C98B4A', null),
  ('p-d9', 'd-desna', 'DP-0303', 'Крекер «Рыбки» солёный', 'Яшкино', 'Печенье', 'уп', 8, '8 × 150 г', 368, 488, 79, 'pack', '#E36B2C', null),
  ('p-d10', 'd-desna', 'DP-0304', 'Пряники «Тульские» с повидлом', 'Ясная Поляна', 'Печенье', 'уп', 4, '4 × 140 г', 276, 372, 71, 'pack', '#8C4B2A', null),
  ('p-d11', 'd-desna', 'DP-0305', 'Сушки ванильные', 'Брянконфи', 'Печенье', 'уп', 1, '1,5 кг', 212, 289, 49, 'bag', '#E8C97A', null),
  ('p-d12', 'd-desna', 'DP-0401', 'Вафли «Артек»', 'Брянконфи', 'Вафли и торты', 'уп', 6, '6 × 250 г', 444, 594, 58, 'pack', '#5C8F3E', null),
  ('p-d13', 'd-desna', 'DP-0402', 'Рулет бисквитный вишнёвый', 'Яшкино', 'Вафли и торты', 'уп', 4, '4 × 200 г', 296, 396, 71, 'pack', '#A6253F', null),
  ('p-d14', 'd-desna', 'DP-0403', 'Зефир ванильный', 'Шармэль', 'Вафли и торты', 'кор', 1, '1,2 кг', 438, 590, 55, 'box', '#F0D6DC', null),
  ('p-d15', 'd-desna', 'DP-0404', 'Мармелад жевательный «Мишки»', 'Бон Пари', 'Вафли и торты', 'уп', 10, '10 × 75 г', 372, 499, 25, 'pack', '#E04F7C', '3 = 2 по средам'),
  ('p-d16', 'd-desna', 'DP-0501', 'Чай чёрный листовой', 'Майский', 'Чай и какао', 'уп', 4, '4 × 200 г', 612, 820, 28, 'box', '#1E1E1E', null),
  ('p-d17', 'd-desna', 'DP-0502', 'Какао-порошок', 'Золотой ярлык', 'Чай и какао', 'уп', 3, '3 × 250 г', 342, 459, 77, 'tin', '#6B3A1E', null),
  ('p-b0', 'd-b32', 'B32-110', 'Гречка ядрица', 'Мистраль', 'Крупы', 'уп', 6, '6 × 900 г', 528, 714, 61, 'bag', '#A8742F', null),
  ('p-b1', 'd-b32', 'B32-111', 'Рис круглозёрный', 'Агро-Альянс', 'Крупы', 'уп', 6, '6 × 900 г', 474, 642, 59, 'bag', '#EDE6D3', null),
  ('p-b2', 'd-b32', 'B32-112', 'Овсяные хлопья «Геркулес»', 'Русский продукт', 'Крупы', 'уп', 6, '6 × 500 г', 342, 468, 42, 'box', '#D6A23E', null),
  ('p-b3', 'd-b32', 'B32-113', 'Пшено шлифованное', 'Увелка', 'Крупы', 'уп', 6, '6 × 800 г', 276, 378, 24, 'bag', '#F2C94C', null),
  ('p-b4', 'd-b32', 'B32-120', 'Макароны «Перья»', 'Макфа', 'Макароны', 'уп', 10, '10 × 450 г', 548, 749, 42, 'pack', '#1F5FA8', null),
  ('p-b5', 'd-b32', 'B32-121', 'Спагетти из твёрдых сортов', 'Шебекинские', 'Макароны', 'уп', 10, '10 × 450 г', 592, 790, 27, 'pack', '#C7372F', null),
  ('p-b6', 'd-b32', 'B32-130', 'Мука пшеничная высший сорт', 'Макфа', 'Мука и сахар', 'уп', 5, '5 × 2 кг', 489, 649, 62, 'bag', '#E6EEF5', null),
  ('p-b7', 'd-b32', 'B32-131', 'Сахар-песок', 'Брянский сахар', 'Мука и сахар', 'уп', 5, '5 × 1 кг', 386, 499, 56, 'bag', '#F7F4EC', 'Цена недели'),
  ('p-b8', 'd-b32', 'B32-140', 'Масло подсолнечное рафинированное', 'Слобода', 'Масло', 'уп', 3, '3 × 1 л', 396, 537, 22, 'bottle', '#F2B705', null),
  ('p-b9', 'd-b32', 'B32-141', 'Масло оливковое Extra Virgin', 'Borges', 'Масло', 'бут', 1, '1 л', 1180, 1590, 56, 'bottle', '#4E6B2A', null),
  ('p-b10', 'd-b32', 'B32-150', 'Тушёнка говяжья ГОСТ', 'Главпродукт', 'Консервы', 'уп', 6, '6 × 338 г', 1290, 1734, 38, 'can', '#8E9AA3', null),
  ('p-b11', 'd-b32', 'B32-151', 'Горошек зелёный', 'Бондюэль', 'Консервы', 'уп', 6, '6 × 400 г', 552, 738, 18, 'can', '#3F8B3A', null),
  ('p-b12', 'd-b32', 'B32-152', 'Сайра натуральная', 'Доброфлот', 'Консервы', 'уп', 6, '6 × 245 г', 798, 1074, 16, 'can', '#2D5D8C', null),
  ('p-b13', 'd-b32', 'B32-160', 'Кофе молотый', 'Жокей', 'Кофе', 'уп', 2, '2 × 450 г', 926, 1258, 41, 'pack', '#5A2E1B', null),
  ('p-b14', 'd-b32', 'B32-161', 'Кофе растворимый', 'Московская кофейня', 'Кофе', 'бут', 1, '190 г', 489, 659, 56, 'jar', '#3B2418', null),
  ('p-b15', 'd-b32', 'B32-170', 'Мёд цветочный', 'Брянская пасека', 'Мёд и варенье', 'шт', 1, '1 кг', 598, 820, 57, 'jar', '#E09A1D', null),
  ('p-b16', 'd-b32', 'B32-171', 'Варенье клубничное', 'Махеевъ', 'Мёд и варенье', 'уп', 3, '3 × 400 г', 402, 546, 49, 'jar', '#C42B3B', null),
  ('p-b17', 'd-b32', 'B32-180', 'Соль поваренная йодированная', 'Илецкая', 'Мука и сахар', 'уп', 6, '6 × 1 кг', 168, 234, 34, 'bag', '#D9E4EC', null)
on conflict (id) do update set
  distributor_id = excluded.distributor_id, sku = excluded.sku, name = excluded.name, brand = excluded.brand,
  category = excluded.category, unit = excluded.unit, pack = excluded.pack, weight = excluded.weight,
  price = excluded.price, shelf_price = excluded.shelf_price, stock = excluded.stock, art = excluded.art,
  tint = excluded.tint, promo = excluded.promo, active = true;
