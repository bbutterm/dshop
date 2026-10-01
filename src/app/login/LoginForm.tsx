"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAction, useData } from "@/lib/data/provider";
import { phoneFmt } from "@/lib/format";
import { roleMeta, ROLES } from "@/lib/roles";
import styles from "./login.module.css";

export function LoginForm() {
  const ctx = useData();
  const { run, pending } = useAction();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const as = params.get("as");
  const [phone, setPhone] = useState("+7 ");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [code, setCode] = useState("");

  // ?as=<userId> — быстрый вход из демо-ссылки «открыть в новой вкладке»
  useEffect(() => {
    if (!ctx?.db || !as) return;
    const u = ctx.db.users.find((x) => x.id === as);
    if (u) {
      ctx.login(u.id);
      const home = roleMeta(u.role).home;
      router.replace(next && next.startsWith(home) ? next : home);
    }
  }, [ctx, as, next, router]);

  const digits = phone.replace(/\D/g, "");
  const go = (userId: string, role: Parameters<typeof roleMeta>[0]) => {
    ctx?.login(userId);
    const home = roleMeta(role).home;
    router.push(next && next.startsWith(home) ? next : home);
  };

  return (
    <main className={styles.page}>
      <div className={styles.col}>
        <Link href="/" className="back">
          <ArrowLeft size={16} /> На главную
        </Link>
        <Logo size={34} />

        <div className="card stack" style={{ ["--pad" as string]: "22px", ["--gap" as string]: "16px" }}>
          {step === "phone" ? (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (digits.length === 11) setStep("code");
              }}
            >
              <div className="h2">Вход по номеру телефона</div>
              <label className="field">
                <span>Телефон</span>
                <input
                  className="input mono"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 900 000-00-00"
                />
              </label>
              <button className="btn btn--primary btn--block" disabled={digits.length !== 11}>
                Получить код
              </button>
              <p className="tiny muted">
                Сотрудника магазина или дистрибьютора узнаём по номеру — его заранее привязывает администратор.
              </p>
            </form>
          ) : (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const u = await run("loginByPhone", phone);
                if (u) go(u.id, u.role);
              }}
            >
              <div className="h2">Код из СМС</div>
              <p className="small muted">
                Отправили на {phoneFmt(digits)}. В демо подойдут любые 4 цифры.
              </p>
              <input
                className="input input--code"
                inputMode="numeric"
                autoFocus
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="····"
              />
              <button className="btn btn--primary btn--block" disabled={code.length !== 4 || !!pending}>
                Войти
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setStep("phone")}>
                Изменить номер
              </button>
            </form>
          )}
        </div>

        <div className="stack" style={{ ["--gap" as string]: "8px" }}>
          <div className="kicker">или демо-аккаунт</div>
          {ROLES.map((r) => {
            const u = ctx?.db?.users.find((x) => x.id === r.userId);
            return (
              <button key={r.role} className={styles.demo} onClick={() => go(r.userId, r.role)}>
                <span className="grow">
                  <b>{r.label}</b>
                  <span className="tiny muted"> · {r.who}</span>
                </span>
                <span className="mono tiny muted">{u ? phoneFmt(u.phone) : ""}</span>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
