import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { RoleEntry } from "@/components/RoleEntry";
import styles from "./landing.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <Logo />
        <nav className="row" style={{ ["--gap" as string]: "6px" }}>
          <Link href="/pitch" className="btn btn--ghost btn--sm">
            Презентация <ArrowUpRight size={14} />
          </Link>
          <Link href="/login" className="btn btn--sm">
            Войти
          </Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <div className="kicker">Пилот · Брянск · кондитерка и бакалея</div>
          <h1 className={`display ${styles.title}`}>
            Опт у&nbsp;дома.
            <br />
            <span>Дешевле полки.</span>
          </h1>
          <p className={styles.lead}>
            Семья заказывает продукты у дистрибьютора и забирает их в магазине у дома. Заказ приезжает с обычной
            поставкой, магазин выдаёт его по коду — без наценки полки и без поездки на оптовку.
          </p>
        </div>

        <figure className={styles.shelf} aria-label="Пример цены">
          <div className={styles.shelfRow}>
            <div className={styles.tagOld}>
              <span className="kicker">на полке</span>
              <b>130–150&nbsp;₽</b>
            </div>
            <div className={`pricetag pricetag--lg ${styles.tagNew}`}>
              <b>106&nbsp;₽</b>
              <s style={{ textDecoration: "none" }}>в «Закупке»</s>
            </div>
          </div>
          <figcaption className={styles.math}>
            <span>опт 100&nbsp;₽</span>
            <span>+&nbsp;6&nbsp;₽, из них плата магазину за выдачу</span>
          </figcaption>
        </figure>
      </section>

      <section className={styles.flow} aria-label="Путь заказа">
        {[
          ["01", "Покупатель", "Выбирает магазин у дома, собирает корзину у поставщика и платит онлайн."],
          ["02", "Дистрибьютор", "Подтверждает позиции, собирает и маркирует пакет, везёт с обычным рейсом."],
          ["03", "Магазин", "Сканирует пакет при приёмке, кладёт на полку выдачи."],
          ["04", "Покупатель", "Получает уведомление и забирает заказ по коду."],
        ].map(([n, who, what]) => (
          <div key={n} className={styles.step}>
            <span className="mono">{n}</span>
            <b>{who}</b>
            <p>{what}</p>
          </div>
        ))}
      </section>

      <section className={styles.enter}>
        <div className="section-title">
          <h2 className="h1">Войти в демо</h2>
          <span className="muted small">данные живут в браузере, их можно сбросить</span>
        </div>
        <RoleEntry />
        <p className={styles.tip}>
          <b>Как показать вживую:</b> откройте покупателя, дистрибьютора и магазин в трёх соседних вкладках (иконка
          ↗ на карточке). Оформите заказ — уведомления побегут между вкладками в реальном времени.
        </p>
      </section>

      <footer className={styles.foot}>
        <span>Закупка · рабочий прототип, октябрь 2026</span>
        <span>Оплата, СМС и эквайринг — заглушки</span>
      </footer>
    </main>
  );
}
