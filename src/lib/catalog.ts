import type { Product } from "./types";

type P = Omit<Product, "id" | "distributorId" | "active" | "stock"> & { stock?: number };

// Ассортимент пилота: кондитерка и бакалея, штучный товар.
// Цены условные: цена канала ≈ опт + 6 %, полка — с наценкой магазина.

export const DESNA: P[] = [
  { sku: "DP-0101", name: "Конфеты «Птичье молоко»", brand: "Брянконфи", category: "Конфеты", unit: "кор", pack: 1, weight: "1 кг", price: 489, shelfPrice: 629, art: "box", tint: "#2F6FB0" },
  { sku: "DP-0102", name: "Конфеты «Красный мак»", brand: "Красный Октябрь", category: "Конфеты", unit: "кор", pack: 1, weight: "1 кг", price: 742, shelfPrice: 960, art: "box", tint: "#B8322A" },
  { sku: "DP-0103", name: "Ирис «Кис-кис»", brand: "Рот Фронт", category: "Конфеты", unit: "уп", pack: 1, weight: "1 кг", price: 318, shelfPrice: 415, art: "bag", tint: "#D8913A" },
  { sku: "DP-0104", name: "Конфеты «Коровка» с вафлей", brand: "Рот Фронт", category: "Конфеты", unit: "уп", pack: 1, weight: "1 кг", price: 405, shelfPrice: 540, art: "bag", tint: "#E9DDB8", promo: "−8 % до воскресенья" },
  { sku: "DP-0201", name: "Шоколад горький 72 %", brand: "Бабаевский", category: "Шоколад", unit: "уп", pack: 5, weight: "5 × 90 г", price: 512, shelfPrice: 690, art: "bar", tint: "#4A2E22" },
  { sku: "DP-0202", name: "Шоколад молочный «Алёнка»", brand: "Красный Октябрь", category: "Шоколад", unit: "уп", pack: 6, weight: "6 × 90 г", price: 498, shelfPrice: 654, art: "bar", tint: "#E2B33B" },
  { sku: "DP-0203", name: "Шоколад с цельным фундуком", brand: "Коркунов", category: "Шоколад", unit: "уп", pack: 4, weight: "4 × 90 г", price: 556, shelfPrice: 760, art: "bar", tint: "#7B2B3A" },
  { sku: "DP-0301", name: "Печенье «Юбилейное» традиционное", brand: "Юбилейное", category: "Печенье", unit: "уп", pack: 6, weight: "6 × 112 г", price: 306, shelfPrice: 402, art: "pack", tint: "#2E5FA8" },
  { sku: "DP-0302", name: "Печенье овсяное", brand: "Брянконфи", category: "Печенье", unit: "кор", pack: 1, weight: "2 кг", price: 398, shelfPrice: 520, art: "box", tint: "#C98B4A" },
  { sku: "DP-0303", name: "Крекер «Рыбки» солёный", brand: "Яшкино", category: "Печенье", unit: "уп", pack: 8, weight: "8 × 150 г", price: 368, shelfPrice: 488, art: "pack", tint: "#E36B2C" },
  { sku: "DP-0304", name: "Пряники «Тульские» с повидлом", brand: "Ясная Поляна", category: "Печенье", unit: "уп", pack: 4, weight: "4 × 140 г", price: 276, shelfPrice: 372, art: "pack", tint: "#8C4B2A" },
  { sku: "DP-0305", name: "Сушки ванильные", brand: "Брянконфи", category: "Печенье", unit: "уп", pack: 1, weight: "1,5 кг", price: 212, shelfPrice: 289, art: "bag", tint: "#E8C97A" },
  { sku: "DP-0401", name: "Вафли «Артек»", brand: "Брянконфи", category: "Вафли и торты", unit: "уп", pack: 6, weight: "6 × 250 г", price: 444, shelfPrice: 594, art: "pack", tint: "#5C8F3E" },
  { sku: "DP-0402", name: "Рулет бисквитный вишнёвый", brand: "Яшкино", category: "Вафли и торты", unit: "уп", pack: 4, weight: "4 × 200 г", price: 296, shelfPrice: 396, art: "pack", tint: "#A6253F" },
  { sku: "DP-0403", name: "Зефир ванильный", brand: "Шармэль", category: "Вафли и торты", unit: "кор", pack: 1, weight: "1,2 кг", price: 438, shelfPrice: 590, art: "box", tint: "#F0D6DC" },
  { sku: "DP-0404", name: "Мармелад жевательный «Мишки»", brand: "Бон Пари", category: "Вафли и торты", unit: "уп", pack: 10, weight: "10 × 75 г", price: 372, shelfPrice: 499, art: "pack", tint: "#E04F7C", promo: "3 = 2 по средам" },
  { sku: "DP-0501", name: "Чай чёрный листовой", brand: "Майский", category: "Чай и какао", unit: "уп", pack: 4, weight: "4 × 200 г", price: 612, shelfPrice: 820, art: "box", tint: "#1E1E1E" },
  { sku: "DP-0502", name: "Какао-порошок", brand: "Золотой ярлык", category: "Чай и какао", unit: "уп", pack: 3, weight: "3 × 250 г", price: 342, shelfPrice: 459, art: "tin", tint: "#6B3A1E" },
];

export const BAKALEYA: P[] = [
  { sku: "B32-110", name: "Гречка ядрица", brand: "Мистраль", category: "Крупы", unit: "уп", pack: 6, weight: "6 × 900 г", price: 528, shelfPrice: 714, art: "bag", tint: "#A8742F" },
  { sku: "B32-111", name: "Рис круглозёрный", brand: "Агро-Альянс", category: "Крупы", unit: "уп", pack: 6, weight: "6 × 900 г", price: 474, shelfPrice: 642, art: "bag", tint: "#EDE6D3" },
  { sku: "B32-112", name: "Овсяные хлопья «Геркулес»", brand: "Русский продукт", category: "Крупы", unit: "уп", pack: 6, weight: "6 × 500 г", price: 342, shelfPrice: 468, art: "box", tint: "#D6A23E" },
  { sku: "B32-113", name: "Пшено шлифованное", brand: "Увелка", category: "Крупы", unit: "уп", pack: 6, weight: "6 × 800 г", price: 276, shelfPrice: 378, art: "bag", tint: "#F2C94C" },
  { sku: "B32-120", name: "Макароны «Перья»", brand: "Макфа", category: "Макароны", unit: "уп", pack: 10, weight: "10 × 450 г", price: 548, shelfPrice: 749, art: "pack", tint: "#1F5FA8" },
  { sku: "B32-121", name: "Спагетти из твёрдых сортов", brand: "Шебекинские", category: "Макароны", unit: "уп", pack: 10, weight: "10 × 450 г", price: 592, shelfPrice: 790, art: "pack", tint: "#C7372F" },
  { sku: "B32-130", name: "Мука пшеничная высший сорт", brand: "Макфа", category: "Мука и сахар", unit: "уп", pack: 5, weight: "5 × 2 кг", price: 489, shelfPrice: 649, art: "bag", tint: "#E6EEF5" },
  { sku: "B32-131", name: "Сахар-песок", brand: "Брянский сахар", category: "Мука и сахар", unit: "уп", pack: 5, weight: "5 × 1 кг", price: 386, shelfPrice: 499, art: "bag", tint: "#F7F4EC", promo: "Цена недели" },
  { sku: "B32-140", name: "Масло подсолнечное рафинированное", brand: "Слобода", category: "Масло", unit: "уп", pack: 3, weight: "3 × 1 л", price: 396, shelfPrice: 537, art: "bottle", tint: "#F2B705" },
  { sku: "B32-141", name: "Масло оливковое Extra Virgin", brand: "Borges", category: "Масло", unit: "бут", pack: 1, weight: "1 л", price: 1180, shelfPrice: 1590, art: "bottle", tint: "#4E6B2A" },
  { sku: "B32-150", name: "Тушёнка говяжья ГОСТ", brand: "Главпродукт", category: "Консервы", unit: "уп", pack: 6, weight: "6 × 338 г", price: 1290, shelfPrice: 1734, art: "can", tint: "#8E9AA3" },
  { sku: "B32-151", name: "Горошек зелёный", brand: "Бондюэль", category: "Консервы", unit: "уп", pack: 6, weight: "6 × 400 г", price: 552, shelfPrice: 738, art: "can", tint: "#3F8B3A" },
  { sku: "B32-152", name: "Сайра натуральная", brand: "Доброфлот", category: "Консервы", unit: "уп", pack: 6, weight: "6 × 245 г", price: 798, shelfPrice: 1074, art: "can", tint: "#2D5D8C" },
  { sku: "B32-160", name: "Кофе молотый", brand: "Жокей", category: "Кофе", unit: "уп", pack: 2, weight: "2 × 450 г", price: 926, shelfPrice: 1258, art: "pack", tint: "#5A2E1B" },
  { sku: "B32-161", name: "Кофе растворимый", brand: "Московская кофейня", category: "Кофе", unit: "бут", pack: 1, weight: "190 г", price: 489, shelfPrice: 659, art: "jar", tint: "#3B2418" },
  { sku: "B32-170", name: "Мёд цветочный", brand: "Брянская пасека", category: "Мёд и варенье", unit: "шт", pack: 1, weight: "1 кг", price: 598, shelfPrice: 820, art: "jar", tint: "#E09A1D" },
  { sku: "B32-171", name: "Варенье клубничное", brand: "Махеевъ", category: "Мёд и варенье", unit: "уп", pack: 3, weight: "3 × 400 г", price: 402, shelfPrice: 546, art: "jar", tint: "#C42B3B" },
  { sku: "B32-180", name: "Соль поваренная йодированная", brand: "Илецкая", category: "Мука и сахар", unit: "уп", pack: 6, weight: "6 × 1 кг", price: 168, shelfPrice: 234, art: "bag", tint: "#D9E4EC" },
];
