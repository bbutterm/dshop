-- Демо-аккаунты для показа: вход по email/паролю из кнопок «Войти как …».
-- id = zakupka.uid('<ключ из seed.ts>'), чтобы совпасть с профилями из demo_load.
-- Пароль общий и публичный (он же в клиенте): это демо, реальных данных за ним нет.

do $$
declare
  a record;
  v_id uuid;
begin
  for a in
    select * from (values
      ('u-anna',    'anna@zakupka.demo',    'Анна Соколова'),
      ('u-tatiana', 'tatiana@zakupka.demo', 'Татьяна Ивановна'),
      ('u-sergey',  'sergey@zakupka.demo',  'Сергей Кольцов'),
      ('u-admin',   'admin@zakupka.demo',   'Команда «Закупки»')
    ) as t(key, email, name)
  loop
    v_id := zakupka.uid(a.key);
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', a.email,
            extensions.crypt('zakupka-demo-2026', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"],"app":"zakupka"}'::jsonb,
            jsonb_build_object('name', a.name, 'app', 'zakupka'), now(), now(), '', '', '', '')
    on conflict (id) do nothing;

    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', a.email, 'email_verified', true),
            'email', now(), now(), now())
    on conflict do nothing;
  end loop;
end $$;
