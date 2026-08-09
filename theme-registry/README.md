# theme-registry — реестр поведения настроек секций

Эталон смысла — **Rose** (она готова и работает правильно). На каждую секцию —
контракт: что обязана делать каждая настройка панели и как это меряется.
Вёрстку тем реестр НЕ проверяет (дефолтный вид = канон верстальщиков каждой
темы) — только **механизм смены настроек**, относительными проверками A→B.

Спека: `docs/superpowers/specs/2026-08-06-section-settings-registry-design.md` (merfy root)
План: `docs/superpowers/plans/2026-08-06-section-settings-registry.md`

## Запуск

```bash
cd backend/services/sites/.worktrees/flux-constructor-live-markup
./flux-baseline/local-stack.sh status          # контур должен жить

node theme-registry/run.mjs --theme rose --block Hero            # вся секция
node theme-registry/run.mjs --theme flux --block Hero --field size  # одно поле
```

Отчёт: консоль + `theme-registry/reports/<theme>/<Block>.md` (с измеренными
числами). Exit 0 = зелёный, 1 = есть провалы, 2 = ошибка конфигурации.

## Как это меряет

Реальный браузер открывает то же превью, что iframe конструктора, шлёт
настоящий `update-block` (канал панели настроек) и меряет **то, что видит
глаз**: высоту секции, координаты текста (Range-rects), computed-стили,
яркость пикселей (затемнение). Ни одной проверки по классам или HTML-диффам.

Гейт истины: контракт секции принят только при **100% зелёном на Rose**.
Красное на Rose = чинить контракт или докладывать реальный баг Rose.

Гард полноты: каждое видимое поле puck-config обязано быть покрыто контрактом
или явно лежать в `uncovered: {поле: причина}` — молчаливых пропусков нет.

## Файлы

| файл | что |
|---|---|
| `run.mjs` | раннер: гард полноты, прогон проверок, отчёт |
| `probe.mjs` | измерители (браузер): snapshot/brightness, update-block канал |
| `sections/<Block>.mjs` | контракт секции (values + смысл по Rose + check) |
| `sites.json` | карта theme → локальный siteId |
| `create-local-site.mjs` | создать локальный сайт темы (RPC sites.create_site) |
| `materialize-seed-revision.mjs` | ревизия из канонического сида packages/theme-*/pages/home.json |
| `rpc-call.mjs` | generic RPC в sites_queue |
| `_build-theme.ts` | собрать preview-шелл темы (ThemeBuildService) |

## Типы проверок

`monotonic-height` · `brightness-drop` · `corner` · `align-x` · `width-toggle`
· `padding-delta` · `text-lands` · `href-lands` · `image-swaps` ·
`monotonic-font` (+ `also` — сопутствующие пропы, как мерчант, который сначала
вводит заголовок, а потом крутит позицию).

## Известные грабли

- Тема должна быть скомпилирована: `node scripts/compile-theme-sections.mjs <t>`
  (раннер проверяет манифест) и preview-шелл собран: `npx tsx theme-registry/_build-theme.ts <t>`
  (иначе превью без CSS — всё «static», зависает первый же замер).
- Rose-сайт локально: `e03dd420…` (sites.json), сид = home.json темы как есть.
- В БД реестр не пишет ничего (SELECT only); прод не затрагивается.
