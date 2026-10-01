import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Закупка — опт у дома",
    short_name: "Закупка",
    description: "Продукты по цене дистрибьютора с выдачей в магазине у дома",
    lang: "ru",
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2eee3",
    theme_color: "#1f5a41",
    categories: ["shopping", "food", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Корзина", url: "/buyer/cart", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Мои заказы", url: "/buyer/orders", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Выдача заказа (магазин)", url: "/store", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
