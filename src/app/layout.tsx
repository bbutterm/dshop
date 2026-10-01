import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Onest, Unbounded } from "next/font/google";
import { DataProvider } from "@/lib/data/provider";
import { Toaster } from "@/components/Toaster";
import "./globals.css";

const onest = Onest({ variable: "--font-text", subsets: ["latin", "cyrillic"] });
const unbounded = Unbounded({ variable: "--font-display", subsets: ["latin", "cyrillic"], weight: ["400", "600", "800"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin", "cyrillic"], weight: ["400", "600"] });

export const metadata: Metadata = {
  title: { default: "Закупка — опт у дома", template: "%s · Закупка" },
  description: "Продукты по цене дистрибьютора с выдачей в магазине у дома.",
};

export const viewport: Viewport = {
  themeColor: "#1F5A41",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${onest.variable} ${unbounded.variable} ${mono.variable}`}>
      <body>
        <DataProvider>
          {children}
          <Toaster />
        </DataProvider>
      </body>
    </html>
  );
}
