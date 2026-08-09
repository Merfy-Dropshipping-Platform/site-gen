# Theme Settings (панель «Настрой свою тему») — flux 13/13 ✓ (2026-08-09)

Гейт: `node theme-registry/theme-gate.mjs --theme flux` (rose-эталон 13/13 пройден первым).
Механика: настоящий эмиттер `POST /preview/tokens-css` → подмена `#__merfy_tokens_css`
на странице превью → computed на живых элементах портов.

| Настройка | Проверка | Факт |
|---|---|---|
| Шрифт заголовков | fontFamily main h1/h2 | Manrope → Playfair Display |
| Шрифт текста | fontFamily main p | Manrope → Roboto |
| Насыщенность заголовков | fontWeight | 400 → 800 |
| Между секций | marginTop owl `main>*+*` | 0 → 80px |
| Кегль заголовка Hero | fontSize h1 (lg) | 24 → 64px |
| Скругление кнопок | borderRadius quick-add | 0 → 24px |
| Скругление полей ввода | borderRadius обёртки инпута | 0 → 16px |
| Скругление медиа | borderRadius медиа-линка карточки | 0 → 24px |
| Карточка: стиль | paddingTop плашки (standard→card) | 0 → 12px |
| Карточка: скругление | borderRadius плашки | 0 → 24px |
| Ширина логотипа | height img лого | 24 → 48px |
| Кегль пунктов меню | fontSize [data-nav-inline] a | 13 → 21px |
| Вид корзины | var --cart-type | drawer → page |

Не покрыто (8): colorSchemes / defaultSchemeIndex / errorColor / wishlistEnabled /
css / fieldRadius / cardBorder (волна v2) + sectionPadding (легаси-ключ без консумеров).

## Починки flux (консумеры портов)
- `Header.astro`: дефолтный барчарт-лого `h-6` → `logoImgCls` (var --size-logo-width,
  фоллбэк 24px = h-6); navLinkBase + `lg:text-[length:var(--size-nav-link,16px)]`.
- `Hero.astro`: headingCls S/M/L + `lg:text-[length:var(--merchant-hero-heading,17|20|24px)]` —
  gated-var (эмитится только при заданном слайдере), иначе `--size-hero-heading:72px`
  (theme.json) флаттенил бы леддер вёрстки. Пруф дефолта: h1 medium = 20px (леддер жив).
- `FluxProductCard.astro` + client `renderCardHtml`: inline 'on'-плашка
  `var(--radius-media,8px)` → `var(--product-card-radius,12px)` (тема-слайдер достаёт
  до блочной плашки; 12px = вёрстка rounded-[12px]).

## Общее (эмиттер, порт origin/main → worktree)
- `--section-gap` (parse+emit+owl `main>*+*{margin-top:…}`) — спека 2026-07-06.
- Типографика: гейтед `@layer utilities` override font/weight h1..h6 + p/li/button/label —
  только при заданном мерчант-значении (default-preserving).
- `--merchant-hero-heading` — новая gated-эмиссия (аддитивно, консумер только flux Hero).

## Гочи
- Блочный «Контейнер» (productCard.cardBackground='on') в ревизии инлайнит
  плашку → гейт сбрасывает его в auto (`cardBackground:''`) — мерим ТЕМУ.
- Превью переписывает href лого в `/__theme/<t>/` → якорь `a[href$="/"]`.
- Сервис = `node dist` (без watch): правки эмиттера требуют `nest build` + рестарт;
  global.css тем — пересборку `tsx scripts/_build-rose-flux.ts`; секций —
  `compile-theme-sections.mjs`. ⚠️ pkill по `dist/src/main.js` убивает и gateway.
