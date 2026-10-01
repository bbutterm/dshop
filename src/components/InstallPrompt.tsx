"use client";

import { Download, PlusSquare, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { registerServiceWorker, useDismissed, useInstall } from "@/lib/pwa";
import { Sheet } from "./Sheet";
import styles from "./InstallPrompt.module.css";

export function PwaRegister() {
  useEffect(() => registerServiceWorker(), []);
  return null;
}

/** Плашка «Установить приложение»: системный диалог на Android/Chrome, инструкция на iPhone */
export function InstallBanner({ variant = "card" }: { variant?: "card" | "row" }) {
  const { state, install } = useInstall();
  const [dismissed, dismiss] = useDismissed("zakupka:install-dismissed");
  const [help, setHelp] = useState(false);
  if (state === "installed" || state === "unknown" || (variant === "card" && dismissed)) return null;

  const onClick = async () => {
    if (state === "prompt") await install();
    else setHelp(true);
  };

  return (
    <>
      {variant === "card" ? (
        <div className={styles.card}>
          <span className={styles.icon}>
            <img src="/icons/icon-192.png" alt="" width={40} height={40} />
          </span>
          <span className="grow stack" style={{ ["--gap" as string]: "2px" }}>
            <b className="small">Закупка на главном экране</b>
            <span className="tiny muted">Открывается как приложение, работает без сети</span>
          </span>
          <button className="btn btn--sm btn--accent" onClick={onClick}>
            Установить
          </button>
          <button className={styles.close} onClick={dismiss} aria-label="Скрыть">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button className="card spread" onClick={onClick} style={{ ["--pad" as string]: "14px 16px" }}>
          <span className="row">
            <Download size={18} />
            <span className="stack" style={{ ["--gap" as string]: "2px" }}>
              <b className="small">Установить приложение</b>
              <span className="tiny muted">Иконка на рабочем столе, полный экран, офлайн</span>
            </span>
          </span>
        </button>
      )}
      <InstallHelp open={help} onClose={() => setHelp(false)} ios={state === "ios"} />
    </>
  );
}

export function InstallHelp({ open, onClose, ios }: { open: boolean; onClose: () => void; ios: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title="Добавить на главный экран">
      {ios ? (
        <ol className={styles.steps}>
          <li>
            Откройте сайт в <b>Safari</b>.
          </li>
          <li>
            Нажмите <Share size={16} className={styles.inline} /> <b>Поделиться</b> внизу экрана.
          </li>
          <li>
            Выберите <PlusSquare size={16} className={styles.inline} /> <b>На экран «Домой»</b> и нажмите «Добавить».
          </li>
        </ol>
      ) : (
        <ol className={styles.steps}>
          <li>
            Откройте меню браузера <b>⋮</b> (Chrome, Яндекс Браузер, Edge).
          </li>
          <li>
            Выберите <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b>.
          </li>
          <li>Иконка «Закупки» появится рядом с остальными приложениями.</li>
        </ol>
      )}
      <p className="tiny muted" style={{ marginTop: 12 }}>
        Приложение откроется на весь экран, без адресной строки, и запустится даже без интернета.
      </p>
    </Sheet>
  );
}
