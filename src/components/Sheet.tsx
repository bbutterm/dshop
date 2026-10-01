"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import styles from "./Sheet.module.css";

/** Нижний лист на телефоне, модальное окно на широком экране */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.sheet} data-wide={wide} role="dialog" aria-modal="true">
        <div className={styles.grip} />
        <div className={styles.head}>
          <div className="h2">{title}</div>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.foot}>{footer}</div>}
      </div>
    </div>
  );
}
