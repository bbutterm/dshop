# Деплой на Vercel

1. **Слить ветку** `claude/mvp-prototype` в `main` (или в Vercel выбрать эту ветку как Production Branch).
2. Vercel → **Add New → Project** → импортировать `bbutterm/dshop`. Framework Preset определится как **Next.js**, остальное по умолчанию (`npm run build`, Node 22).
3. **Environment Variables** (Production и Preview):

   | Имя | Значение |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://ajltzwomvyvntvtjnrrf.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | публичный ключ из Supabase → Project Settings → API Keys (`sb_publishable_…`) |

   Без них приложение тоже работает — в демо-режиме, данные в браузере.
4. **Deploy.** После первого деплоя:
   - открыть `/demo` → «Начать заново» — загрузит демо-данные в базу;
   - Supabase → Authentication → URL Configuration → Site URL = адрес Vercel (нужно только для писем и регистрации по почте).
5. Проверить: `/` (вход), `/demo` (сценарий), `/pitch` (презентация), установка на телефон (PWA работает только по HTTPS — на Vercel он есть).

Что уже настроено в репозитории: `next.config.ts` (заголовки для `sw.js`, `/pitch`), манифест PWA (`src/app/manifest.ts`), иконки, `.env.example`.
