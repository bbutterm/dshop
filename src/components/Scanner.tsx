"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Sheet } from "./Sheet";

// BarcodeDetector есть в Chrome на Android; в Safari пока нет — тогда показываем запасной вариант
interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: { new (opts: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };
  }
}

export function canScan() {
  return typeof window !== "undefined" && !!window.BarcodeDetector && !!navigator.mediaDevices?.getUserMedia;
}

export function vibrate(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}

/** Сканер камерой: QR кода выдачи и Code 128 маркировки заказа */
export function ScannerSheet({
  open,
  onClose,
  onResult,
  title,
  hint,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (value: string) => void;
  title: string;
  hint: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // свежий обработчик без перезапуска камеры при каждом рендере родителя
  const cb = useRef(onResult);
  useEffect(() => {
    cb.current = onResult;
  });

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    (async () => {
      try {
        const detector = new window.BarcodeDetector!({ formats: ["qr_code", "code_128"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          try {
            const codes = await detector.detect(video.current);
            if (codes[0]?.rawValue) {
              clearInterval(timer);
              vibrate(30);
              cb.current(codes[0].rawValue);
            }
          } catch {}
        }, 250);
      } catch {
        setError("Нет доступа к камере. Разрешите камеру в настройках браузера или введите код вручную.");
      }
    })();
    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="stack">
        {error ? (
          <div className="notice notice--tomato small">{error}</div>
        ) : (
          <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", background: "#000", aspectRatio: "3 / 4" }}>
            <video ref={video} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div
              style={{
                position: "absolute",
                inset: "22% 14%",
                border: "3px solid var(--mustard)",
                borderRadius: 16,
                boxShadow: "0 0 0 999px rgba(0,0,0,.35)",
              }}
            />
          </div>
        )}
        <span className="small muted row" style={{ ["--gap" as string]: "6px" }}>
          <Camera size={16} /> {hint}
        </span>
      </div>
    </Sheet>
  );
}
