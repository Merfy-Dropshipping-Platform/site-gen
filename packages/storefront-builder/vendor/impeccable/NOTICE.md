# Impeccable — сторонний код

`detect-antipatterns-browser.js` — детектор «ИИ-дизайна» из проекта Impeccable. Используется как есть, без правок:
файл сгенерирован (`cargo xtask bundle`), руками его не меняют.

- Проект: https://github.com/pbakaus/impeccable
- Файл в проекте: `crates/live/assets/detect-antipatterns-browser.js`
- Коммит: `8409a564d1baee90b2dde4f7a8f06288838e3921`
- Скачан: 2026-10-28 по raw-ссылке этого коммита
- SHA-256 файла: `eb206f104a474831e9874a3c40a201d6d27f1c067c4482714151475b65911b1f`
- Авторские права: Paul Bakaus (в заголовке файла — 2026, в `LICENSE` — 2025)
- Лицензия: Apache License 2.0, текст — `LICENSE` рядом (взят из того же коммита)

Где используется: снимок черновика в проверяющем процессе (`src/look/look-page.ts`) подключает файл к странице,
отрисованной в Chromium, и вызывает `window.impeccableDetectAsync()`. Файл читается с диска при первой отрисовке;
каталог `vendor/` входит в образ вместе с пакетом (цель `storefront-checker` в `Dockerfile` копирует
`packages/storefront-builder` целиком). Перенесён 2026-10-28 из merfy-mcp (`vendor/impeccable/`) без изменений.

Обновление: скачать файл из нового коммита, обновить коммит и SHA-256 здесь, прогнать
`pnpm exec vitest run __tests__/look-browser.test.ts` (из `packages/storefront-builder`).
