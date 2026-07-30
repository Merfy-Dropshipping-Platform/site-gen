# Как всё проверить

Локальный контур. Прод не затрагивается.

## Что открыть

| адрес | что это |
|---|---|
| http://localhost:3000/?siteId=132d3a3e-a28f-40b7-98fa-a0200151cfb8 | **конструктор** (панель настроек) |
| http://localhost:8099/ | **живая витрина** (как у покупателя) |
| https://flux.merfy.ru/ | **эталон верстальщиков** — с чем сравниваем |

Вход в конструктор: `flux-e2e-test-local@example.com` / `FluxE2ETest2026!`

Открывай витрину и эталон в двух вкладках рядом — так расхождения видно сразу.

## Что смотреть глазами

**Шапка** (должна совпасть с эталоном):
- высота 136px на десктопе, 80px на мобиле; фон белый;
- два ряда: лого + иконки, под ними меню;
- активный пункт меню чёрный, остальные светло-серые;
- лого 81×24, иконки 32×32 (на мобиле 24×24).

**Первый экран (Hero):**
- заголовок чёрный, ЗАГЛАВНЫМИ, тонкий;
- подзаголовок серый `#999`, тоже заглавными;
- кнопка тёмно-синяя `#1e2952`, высота 48px, скругление 4px;
- текст по умолчанию «Технологии без паузы» / «Новинки 2026»;
- фото растворяется в белый к нижней кромке (не затемнение).

**Поля по краям** — контент не должен прилипать к краям экрана: 16px на мобиле, 40px на планшете, 80px на десктопе.

**Чего быть НЕ должно:** оранжевого цвета нигде, чёрных фонов у секций.

## Настройки шапки — что покрутить

В конструкторе выбери слева секцию **Header**, справа появится панель:

| настройка | что должно измениться |
|---|---|
| Положение логотипа | `Сверху слева`/`Сверху в центре` → два ряда; `Слева`/`По центру` → один ряд |
| Статичность | `Никогда` → шапка НЕ липнет при прокрутке; `Всегда` → липнет; `При прокрутке вверх` → прячется вниз, появляется вверх |
| Цветовая схема | меняет фон и цвет текста шапки |
| Отступы | сверху/снизу, 12 = эталонные 24px |
| Тип меню | `Боковое` → меню уезжает в шторку; `Расширенное` → буквы вразрядку |
| Цветовая схема меню | перекрашивает только строку меню |
| Изменить пункты меню | добавить/убрать/переименовать пункт |

**«Статичность → Никогда» я в UI не прокликивал** — проверял на уровне рендера. Это первое, что стоит потрогать руками.

После правки жми **Сохранить**, потом перезагрузи страницу — настройка должна пережить перезагрузку.

## Проверка «превью = витрина»

Правки в конструкторе видны в превью сразу, а на витрине — только после пересборки:

```bash
cd backend/services/sites/.worktrees/flux-constructor-live-markup
curl -X POST "http://localhost:3114/regenerate-site/132d3a3e-a28f-40b7-98fa-a0200151cfb8?template=flux"
```

Затем обнови http://localhost:8099/ — должно совпасть с превью.

Автоматически (снимает оба и сверяет побайтово на 4 разрешениях):

```bash
node flux-baseline/capture.mjs --url http://localhost:8099/ --label local-live
node flux-baseline/capture.mjs --url "http://localhost:3114/api/sites/132d3a3e-a28f-40b7-98fa-a0200151cfb8/preview" --label local-preview
for vp in 375 768 1280 1920; do
  a=$(shasum -a 256 flux-baseline/local-live/home.$vp.png | cut -d' ' -f1)
  b=$(shasum -a 256 flux-baseline/local-preview/home.$vp.png | cut -d' ' -f1)
  [ "$a" = "$b" ] && echo "$vp: совпало" || echo "$vp: РАЗОШЛОСЬ"
done
```

## Сравнение с эталоном

```bash
# снять эталон (уже снят, пересниимать не обязательно)
node flux-baseline/capture.mjs --url https://flux.merfy.ru/ --label reference --repeat

# таблица расхождений по секциям
node flux-baseline/report.mjs reference local-live > flux-baseline/GAP-REFERENCE-VS-LOCAL.md

# расхождения по исходникам (точнее пикселей — называет конкретное значение)
REF_ROOT=<клон flux-theme> node flux-baseline/source-diff.mjs
```

Матрица настроек шапки (каждая крутится двумя значениями, сверяется реакция разметки):

```bash
node flux-baseline/header-settings-matrix.mjs
```

## Тесты

```bash
cd backend/services/sites/.worktrees/flux-constructor-live-markup
npx jest --runInBand \
  src/themes/tokens-css.spec.ts \
  src/themes/__tests__/manifest-live-reload.spec.ts \
  src/generator/__tests__/theme-pipeline-guard.spec.ts \
  src/generator/__tests__/legacy-mode-guard.spec.ts \
  src/storage/__tests__/local-s3-guard.spec.ts        # ожидается 53/53

pnpm --dir packages/theme-flux test                    # ожидается 26/27
```

Единственный допустимый провал — `matches ThemeManifestSchema`: пробел в
`TOKEN_REGISTRY` (`--size-catalog-*`, `--color-button-secondary-*`), тянется с
прошлой сессии и к этим правкам не относится.

Конструктор:

```bash
cd backend/services/constructor && npx tsc --noEmit    # ожидается 0 ошибок
```

## Цикл правки темы (грабли убраны)

Достаточно двух шагов — пересборка сервиса и его перезапуск больше не нужны:

```bash
# 1. правка themes/flux/... → перекомпилировать секции
node scripts/compile-theme-sections.mjs flux
# 2. пересобрать витрину
curl -X POST "http://localhost:3114/regenerate-site/<siteId>?template=flux"
```

Правка `packages/theme-*/theme.json` применяется **сразу**, без шагов вообще —
достаточно пересобрать витрину.

Что для этого сделано:
- вне production манифест темы читается с диска (было: из копии в `dist/`,
  которая обновлялась только `nest build` — значения молча оставались старыми);
- контроллер `puck-config` переведён на общий загрузчик (держал вторую копию
  импортов, из-за чего рендер и конструктор видели РАЗНЫЕ значения);
- скомпилированные блоки импортируются с меткой времени файла, поэтому
  перекомпиляция подхватывается без перезапуска.

`nest build` нужен только когда правишь **TypeScript** сервиса.

## Если что-то упало

```bash
cd backend/services/sites/.worktrees/flux-constructor-live-markup
./flux-baseline/local-stack.sh start        # поднимет всё в правильном порядке
```

Живая витрина (nginx по продовому конфигу раздачи), если контейнера нет:

```bash
docker run -d --name merfy-local-live --network merfy-network -p 8099:80 \
  -v /tmp/merfy-local-logs/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro nginx:alpine
```

## Управление сервисами

```bash
./flux-baseline/local-stack.sh status            # кто жив
./flux-baseline/local-stack.sh restart sites     # перезапустить ОДИН сервис
./flux-baseline/local-stack.sh stop              # погасить всё
```

Скрипт ведёт учёт по PID каждого сервиса, а если pid-файл потерян — находит
процесс по его порту. Это замена `pkill -f "dist/src/main.js"`, под который
попадали ВСЕ сервисы разом (user, billing, gateway и sites запускаются
одинаковой командой). Плюс он не даст стартовать поверх занятого порта: раньше
второй экземпляр тихо умирал, а отвечать продолжал старый код — самый обидный
вид «правка не применилась».

## Если 503 и не сохраняется

Не поднят billing — `PaywallGuard` в gateway ждёт от него ответ и без него
блокирует запись ревизии.
