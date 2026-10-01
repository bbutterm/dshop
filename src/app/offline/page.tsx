import Link from "next/link";
import { LogoMark } from "@/components/Logo";

export const metadata = { title: "Нет сети" };

export default function Offline() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div className="stack" style={{ ["--gap" as string]: "14px", alignItems: "center", maxWidth: 340 }}>
        <LogoMark size={48} />
        <h1 className="h1">Нет связи</h1>
        <p className="muted">Эта страница ещё не открывалась на устройстве. Вернитесь, когда появится интернет — заказы и корзина сохранены.</p>
        <Link href="/app" className="btn btn--primary">
          Попробовать снова
        </Link>
      </div>
    </main>
  );
}
