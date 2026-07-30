# Базовая линия Flux — набор `reference`

- URL: https://flux.merfy.ru/
- Условия съёмки: engine=chromium (playwright bundled), deviceScaleFactor=1, colorScheme=light, reducedMotion=reduce, locale=ru-RU, timezone=Europe/Moscow, animations=disabled via injected CSS

## Gate 0 — воспроизводимость

| viewport | высота документа | sha256 скриншота | 2-й прогон совпал | h-overflow | console errors | 4xx/5xx |
|---|---:|---|---|---|---:|---:|
| 375 | 5620 | `9303931690dd5d61` | ✓ | нет | 0 | 0 |
| 768 | 5527 | `49a9dbd901265b89` | ✓ | ⚠️ ДА | 0 | 0 |
| 1280 | 4726 | `37883c5cc8774c3e` | ✓ | нет | 0 | 0 |
| 1920 | 5297 | `a0d495127d9f4711` | ✓ | нет | 0 | 0 |

## Геометрия секций (y / высота, px)

| # | секция | 375: y | 768: y | 1280: y | 1920: y | 375: h | 768: h | 1280: h | 1920: h |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | Header | 48 | 48 | 48 | 48 | 80 | 136 | 136 | 136 |
| 1 | hero-title | 128 | 184 | 184 | 184 | 380 | 480 | 540 | 810 |
| 2 | collections | 508 | 664 | 724 | 994 | 1322 | 486 | 602 | 668 |
| 3 | featured | 1830 | 1150 | 1326 | 1662 | 888 | 1506 | 814 | 916 |
| 4 | popular | 2718 | 2656 | 2140 | 2578 | 904 | 611 | 719 | 769 |
| 5 | cta-title | 3621 | 3267 | 2858 | 3347 | 361 | 315 | 315 | 291 |
| 6 | gallery | 3982 | 3581 | 3173 | 3637 | 737 | 1308 | 915 | 1022 |
| 7 | Footer | 4719 | 4889 | 4088 | 4659 | 901 | 638 | 638 | 638 |

## Ширина контента секции (x .. x+w)

| секция | 375 | 768 | 1280 | 1920 |
|---|---|---|---|---|
| Header | 0..375 | 0..768 | 0..1280 | 0..1920 |
| hero-title | 0..375 | 0..768 | 0..1280 | 0..1920 |
| collections | 0..375 | 0..768 | 0..1280 | 0..1920 |
| featured | 0..375 | 0..768 | 0..1280 | 0..1920 |
| popular | 0..375 | 0..768 | 0..1280 | 0..1920 |
| cta-title | 0..375 | 0..768 | 0..1280 | 0..1920 |
| gallery | 0..375 | 0..768 | 0..1280 | 0..1920 |
| Footer | 0..375 | 0..768 | 0..1280 | 0..1920 |

## Типографика заголовков секций

| секция | текст | 375 | 768 | 1280 | 1920 | family | weight | transform | letter-spacing |
|---|---|---|---|---|---|---|---|---|---|
| hero-title | Технологии без паузы | 20px | 24px | 24px | 24px | Roboto Flex | 300 | uppercase | normal |
| collections | Категории | 19px | 23px | 23px | 23px | Roboto Flex | 300 | uppercase | normal |
| featured | Полноразмерные наушники Silver | 19px | 24px | 24px | 24px | Roboto Flex | 300 | uppercase | normal |
| popular | Бестселлеры | 19px | 23px | 23px | 23px | Roboto Flex | 300 | uppercase | normal |
| cta-title | Следующее поколение уже с вами! | 19px | 23px | 23px | 23px | Roboto Flex | 300 | uppercase | normal |
| Footer | Подпишитесь на нашу рассылку | 18px | 20px | 20px | 20px | Roboto Flex | 300 | uppercase | normal |

## Кнопки и CTA (по 1280)

| секция | текст | h | bg | color | radius | font | size | href |
|---|---|---:|---|---|---|---|---|---|
| hero-title | Новинки 2026 | 48 | rgb(30, 41, 82) | rgb(255, 255, 255) | 4px | Roboto Flex | 16px | /catalog |
| featured | Добавить в корзину | 56 | rgb(255, 255, 255) | rgb(30, 41, 82) | 4px | Roboto Flex | 16px | — |
| featured | Купить сейчас | 56 | rgb(30, 41, 82) | rgb(255, 255, 255) | 4px | Roboto Flex | 16px | — |
| popular | Скидка | 244 | rgb(251, 251, 251) | rgb(0, 0, 0) | 12px | Manrope | 16px | /products/flux-over-silver |
| popular | В корзину | 48 | rgb(30, 41, 82) | rgb(255, 255, 255) | 4px | Roboto Flex | 16px | — |
| popular | В корзину | 48 | rgb(30, 41, 82) | rgb(255, 255, 255) | 4px | Roboto Flex | 16px | — |
| popular | В корзину | 48 | rgb(30, 41, 82) | rgb(255, 255, 255) | 4px | Roboto Flex | 16px | — |
| popular | Нет в наличии | 48 | rgb(255, 255, 255) | rgb(30, 41, 82) | 4px | Roboto Flex | 16px | — |
| popular | Смотреть ещё | 48 | rgba(0, 0, 0, 0) | rgb(30, 41, 82) | 4px | Roboto Flex | 16px | /catalog |
| cta-title | Смотреть новинки | 56 | rgb(30, 41, 82) | rgb(255, 255, 255) | 6px | Roboto Flex | 16px | /catalog |
| gallery | Скидка | 339 | rgb(251, 251, 251) | rgb(0, 0, 0) | 12px | Manrope | 16px | /products/flux-tws-white |
| gallery | В корзину | 48 | rgb(30, 41, 82) | rgb(255, 255, 255) | 4px | Roboto Flex | 16px | — |

## Шрифты

Computed font-family на видимых текстовых узлах (1280):

- `"Roboto Flex", Roboto, Manrope, system-ui, sans-serif`
- `Inter, ui-sans-serif, system-ui, sans-serif`
- `Manrope, ui-sans-serif, system-ui, -apple-system, sans-serif`
- `ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`

Загруженные @font-face:

- Inter 300 normal (unloaded)
- Inter 300 normal (loaded)
- Inter 300 normal (unloaded)
- Inter 300 normal (unloaded)
- Inter 300 normal (unloaded)
- Inter 300 normal (unloaded)
- Inter 300 normal (loaded)
- Inter 400 normal (unloaded)
- Inter 400 normal (unloaded)
- Inter 400 normal (unloaded)
- Inter 400 normal (unloaded)
- Inter 400 normal (unloaded)
- Inter 400 normal (unloaded)
- Inter 400 normal (unloaded)
- Inter 500 normal (unloaded)
- Inter 500 normal (unloaded)
- Inter 500 normal (unloaded)
- Inter 500 normal (unloaded)
- Inter 500 normal (unloaded)
- Inter 500 normal (unloaded)
- Inter 500 normal (unloaded)
- Inter 600 normal (unloaded)
- Inter 600 normal (unloaded)
- Inter 600 normal (unloaded)
- Inter 600 normal (unloaded)
- Inter 600 normal (unloaded)
- Inter 600 normal (unloaded)
- Inter 600 normal (unloaded)
- Inter 700 normal (unloaded)
- Inter 700 normal (unloaded)
- Inter 700 normal (unloaded)
- Inter 700 normal (unloaded)
- Inter 700 normal (unloaded)
- Inter 700 normal (unloaded)
- Inter 700 normal (unloaded)
- Manrope 300 normal (unloaded)
- Manrope 300 normal (unloaded)
- Manrope 300 normal (unloaded)
- Manrope 300 normal (unloaded)
- Manrope 300 normal (unloaded)
- Manrope 300 normal (unloaded)
- Manrope 400 normal (unloaded)
- Manrope 400 normal (unloaded)
- Manrope 400 normal (unloaded)
- Manrope 400 normal (unloaded)
- Manrope 400 normal (unloaded)
- Manrope 400 normal (loaded)
- Manrope 500 normal (unloaded)
- Manrope 500 normal (unloaded)
- Manrope 500 normal (unloaded)
- Manrope 500 normal (unloaded)
- Manrope 500 normal (unloaded)
- Manrope 500 normal (unloaded)
- Manrope 600 normal (unloaded)
- Manrope 600 normal (unloaded)
- Manrope 600 normal (unloaded)
- Manrope 600 normal (unloaded)
- Manrope 600 normal (unloaded)
- Manrope 600 normal (unloaded)
- Manrope 700 normal (unloaded)
- Manrope 700 normal (unloaded)
- Manrope 700 normal (unloaded)
- Manrope 700 normal (unloaded)
- Manrope 700 normal (unloaded)
- Manrope 700 normal (unloaded)
- Roboto Flex 300 normal (unloaded)
- Roboto Flex 300 normal (loaded)
- Roboto Flex 300 normal (unloaded)
- Roboto Flex 300 normal (unloaded)
- Roboto Flex 300 normal (loaded)
- Roboto Flex 300 normal (loaded)
- Roboto Flex 400 normal (unloaded)
- Roboto Flex 400 normal (unloaded)
- Roboto Flex 400 normal (unloaded)
- Roboto Flex 400 normal (unloaded)
- Roboto Flex 400 normal (unloaded)
- Roboto Flex 400 normal (unloaded)

## Ассеты (1280)

- Стили: 2
  - https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Manrope:wght@300;400;500;600;700&family=Roboto+Flex:opsz,wght@8..144,300;8..144,400&display=swap
  - https://flux.merfy.ru/_astro/about.DwCDcUNa.css
- Скрипты: 4
  - https://flux.merfy.ru/_astro/FluxCartPopup.astro_astro_type_script_index_0_lang.BxHZnA3G.js
  - https://flux.merfy.ru/_astro/ProductConfigurator.astro_astro_type_script_index_0_lang.q-9gOvw9.js
  - https://flux.merfy.ru/_astro/FluxCartDrawer.astro_astro_type_script_index_0_lang.CYxTw_2-.js
  - https://flux.merfy.ru/_astro/Layout.astro_astro_type_script_index_0_lang.1UILYafy.js
- Изображения: 35
  - https://flux.merfy.ru/icons/menu-burger.svg
  - https://flux.merfy.ru/icons/menu-close.svg
  - https://flux.merfy.ru/icons/logo-flux.svg
  - https://flux.merfy.ru/icons/cart.svg
  - https://flux.merfy.ru/icons/search-lg.svg
  - https://flux.merfy.ru/icons/user.svg
  - https://flux.merfy.ru/icons/search-sm.svg
  - https://flux.merfy.ru/icons/arrow-slide-right.svg
  - https://flux.merfy.ru/images/4x/hero-headphones.webp
  - https://flux.merfy.ru/images/4x/headphones-silver-studio.webp
  - https://flux.merfy.ru/images/4x/tws-white-2.webp
  - https://flux.merfy.ru/images/4x/speaker-graphite.webp
  - https://flux.merfy.ru/images/4x/headphones-silver.webp
  - https://flux.merfy.ru/images/4x/headphones-silver-3.webp
  - https://flux.merfy.ru/images/4x/headphones-silver-front.webp
  - https://flux.merfy.ru/images/4x/headphones-silver-4.webp
  - https://flux.merfy.ru/images/4x/headphones-silver-angle.webp
  - https://flux.merfy.ru/icons/minus.svg
  - https://flux.merfy.ru/icons/plus.svg
  - https://flux.merfy.ru/icons/share.svg
  - https://flux.merfy.ru/icons/arrow-slide-left.svg
  - https://flux.merfy.ru/images/4x/headphones-graphite.webp
  - https://flux.merfy.ru/images/4x/headphones-navy.webp
  - https://flux.merfy.ru/images/4x/headphones-green.webp
  - https://flux.merfy.ru/images/4x/gallery-tws-lifestyle.webp
  - https://flux.merfy.ru/images/4x/tws-white.webp
  - https://flux.merfy.ru/icons/arrow-input.svg
  - https://flux.merfy.ru/icons/social-vk.svg
  - https://flux.merfy.ru/icons/social-youtube.svg
  - https://flux.merfy.ru/icons/social-yandex-dzen.svg
  - https://flux.merfy.ru/icons/social-tiktok.svg
  - https://flux.merfy.ru/icons/social-telegram.svg
  - https://flux.merfy.ru/icons/MasterCard.svg
  - https://flux.merfy.ru/icons/Visa.svg
  - https://flux.merfy.ru/icons/MIR.svg

## Тексты и ссылки по секциям (1280)

### 0. Header (`<header>`)

- bbox: x=0 y=48 w=1280 h=136
- bg: `rgb(255, 255, 255)`, padding: 0px/0px/0px/0px
- Ссылки: `/`, `/auth/sign-in`, `/catalog/naushniki`, `/catalog/tws`, `/catalog/kolonki`, `/catalog/saundbary`
- Изображения:
  - logo-flux.svg @ 81×24 (natural 300×150) object-fit=fill aspect=auto 81 / 24
  - search-lg.svg @ 32×32 (natural 24×24) object-fit=contain aspect=auto 24 / 24
  - cart.svg @ 32×32 (natural 24×24) object-fit=contain aspect=auto 24 / 24
  - user.svg @ 32×32 (natural 24×24) object-fit=contain aspect=auto 24 / 24

### 1. hero-title (`<section>`)

- bbox: x=0 y=184 w=1280 h=540
- bg: `rgb(255, 255, 255)`, padding: 0px/0px/0px/0px
- Заголовки:
  - `<h1>` «Технологии без паузы» — 24px/36px 300 uppercase
- Абзацы:
  - «Будущее — в режиме онлайн.Ваш новый гаджет — уже в наличии.» — 14px rgb(153, 153, 153)
- Ссылки: `/catalog`
- Изображения:
  - hero-headphones.webp object-fit=— aspect=—
  - hero-headphones.png @ 1280×813 (natural 1920×1220) object-fit=fill aspect=auto

### 2. collections (`<section>`)

- bbox: x=0 y=724 w=1280 h=602
- bg: `rgb(255, 255, 255)`, padding: 0px/0px/0px/0px
- Заголовки:
  - `<h2>` «Категории» — 23px/34.5px 300 uppercase
- Ссылки: `/catalog/naushniki`, `/catalog/tws`, `/catalog/kolonki`
- Изображения:
  - headphones-silver-studio.webp object-fit=— aspect=—
  - headphones-silver-studio.png @ 363×363 (natural 1920×1920) object-fit=cover aspect=auto 318 / 318
  - tws-white-2.webp object-fit=— aspect=—
  - tws-white-2.png @ 363×363 (natural 1920×1920) object-fit=cover aspect=auto 318 / 318
  - speaker-graphite.webp object-fit=— aspect=—
  - speaker-graphite.png @ 363×363 (natural 1920×1920) object-fit=cover aspect=auto 318 / 318

### 3. featured (`<section>`)

- bbox: x=0 y=1326 w=1280 h=814
- bg: `rgb(255, 255, 255)`, padding: 0px/0px/0px/0px
- Заголовки:
  - `<h2>` «Полноразмерные наушники Silver» — 24px/36px 300 uppercase
- Абзацы:
  - «Полноразмерные наушники» — 16px rgb(153, 153, 153)
- Ссылки: `/products/flux-over-silver`
- Изображения:
  - headphones-silver.webp object-fit=— aspect=—
  - headphones-silver.png @ 550×550 (natural 1920×1920) object-fit=cover aspect=auto 652 / 652
  - headphones-silver.webp object-fit=— aspect=—
  - headphones-silver.png @ 118×118 (natural 1920×1920) object-fit=cover aspect=auto 120 / 120
  - headphones-silver-3.webp object-fit=— aspect=—
  - headphones-silver-3.png @ 120×120 (natural 1920×1920) object-fit=cover aspect=auto 120 / 120
  - headphones-silver-front.webp object-fit=— aspect=—
  - headphones-silver-front.png @ 120×120 (natural 1920×1920) object-fit=cover aspect=auto 120 / 120
  - headphones-silver-4.webp object-fit=— aspect=—
  - headphones-silver-4.png @ 120×120 (natural 1920×1920) object-fit=cover aspect=auto 120 / 120

### 4. popular (`<section>`)

- bbox: x=0 y=2140 w=1280 h=719
- bg: `rgb(255, 255, 255)`, padding: 0px/0px/0px/0px
- Заголовки:
  - `<h2>` «Бестселлеры» — 23px/34.5px 300 uppercase
- Ссылки: `/products/flux-over-silver`, `/products/flux-over-graphite`, `/products/flux-over-navy`, `/products/flux-over-green`, `/catalog`
- Изображения:
  - headphones-silver.webp object-fit=— aspect=—
  - headphones-silver.png @ 244×244 (natural 1920×1920) object-fit=cover aspect=auto 286 / 286
  - headphones-graphite.webp object-fit=— aspect=—
  - headphones-graphite.png @ 244×244 (natural 1920×1920) object-fit=cover aspect=auto 286 / 286
  - headphones-navy.webp object-fit=— aspect=—
  - headphones-navy.png @ 244×244 (natural 1920×1920) object-fit=cover aspect=auto 286 / 286
  - headphones-green.webp object-fit=— aspect=—
  - headphones-green.png @ 244×244 (natural 1920×1920) object-fit=cover aspect=auto 286 / 286

### 5. cta-title (`<section>`)

- bbox: x=0 y=2858 w=1280 h=315
- bg: `rgb(251, 251, 251)`, padding: 0px/0px/0px/0px
- Заголовки:
  - `<h2>` «Следующее поколение уже с вами!» — 23px/34.5px 300 uppercase
- Абзацы:
  - «Они здесь. Устройства, которые изменят завтра, уже сегодня в нашем потоке новино» — 16px rgb(153, 153, 153)
- Ссылки: `/catalog`

### 6. gallery (`<section>`)

- bbox: x=0 y=3173 w=1280 h=915
- bg: `rgb(255, 255, 255)`, padding: 0px/0px/0px/0px
- Ссылки: `/catalog/tws`, `/products/flux-tws-white`
- Изображения:
  - gallery-tws-lifestyle.webp object-fit=— aspect=—
  - gallery-tws-lifestyle.png @ 741×787 (natural 1920×1920) object-fit=cover aspect=auto 875 / 875
  - tws-white.webp object-fit=— aspect=—
  - tws-white.png @ 339×339 (natural 1920×1920) object-fit=cover aspect=auto 286 / 286
  - tws-white-2.webp object-fit=— aspect=—
  - tws-white-2.png @ 363×228 (natural 1920×1920) object-fit=cover aspect=auto 429 / 269

### 7. Footer (`<footer>`)

- bbox: x=0 y=4088 w=1280 h=638
- bg: `rgb(251, 251, 251)`, padding: 0px/0px/0px/0px
- Заголовки:
  - `<h2>` «Подпишитесь на нашу рассылку» — 20px/30px 300 uppercase
- Абзацы:
  - «Введите электронную почту и получайте информацию о нашем бренде» — 16px rgb(153, 153, 153)
  - «© 2026 Flux Все права защищены. Powered by Merfy» — 16px rgb(255, 255, 255)
- Ссылки: `/catalog/naushniki`, `/catalog/tws`, `/catalog/kolonki`, `/catalog/saundbary`, `/legal/delivery`, `/legal/return`, `/legal/terms`, `/legal/privacy`, `tel:+70000000000`, `mailto:example@flux.merfy`, `#`
- Изображения:
  - arrow-input.svg @ 24×24 (natural 300×150) object-fit=fill aspect=auto 24 / 24
  - social-vk.svg @ 24×24 (natural 300×150) object-fit=contain aspect=auto 24 / 24
  - social-youtube.svg @ 24×24 (natural 300×150) object-fit=contain aspect=auto 24 / 24
  - social-yandex-dzen.svg @ 24×24 (natural 300×150) object-fit=contain aspect=auto 24 / 24
  - social-tiktok.svg @ 24×24 (natural 300×150) object-fit=contain aspect=auto 24 / 24
  - social-telegram.svg @ 24×24 (natural 300×150) object-fit=contain aspect=auto 24 / 24
  - MasterCard.svg @ 31×24 (natural 300×150) object-fit=fill aspect=auto 31 / 24
  - Visa.svg @ 44×24 (natural 300×150) object-fit=fill aspect=auto 44 / 24
  - MIR.svg @ 48×24 (natural 300×150) object-fit=fill aspect=auto 48 / 24

## Breakpoint-поведение — раскладочные сетки секций

Показаны только контейнеры, у которых сетка/направление/gap МЕНЯЮТСЯ между viewport.
Контейнеры сопоставляются по DOM-пути внутри секции.

### Header

| путь в секции | 375 | 768 | 1280 | 1920 |
|---|---|---|---|---|
| `div` | row<br>gap normal<br>375×80 | column<br>gap 20px<br>768×136 | column<br>gap 20px<br>1280×136 | column<br>gap 20px<br>1480×136 |
| `div>div` | — | row<br>gap normal<br>688×44 | row<br>gap normal<br>1120×44 | row<br>gap normal<br>1320×44 |
| `div>div>div` | — | row<br>gap 16px<br>164×44 | row<br>gap 16px<br>164×44 | row<br>gap 16px<br>164×44 |
| `div>nav` | — | row<br>gap 32px<br>688×24 | row<br>gap 32px<br>1120×24 | row<br>gap 32px<br>1320×24 |

### hero-title

| путь в секции | 375 | 768 | 1280 | 1920 |
|---|---|---|---|---|
| `div>div>div` | column<br>gap 32px<br>375×380 | column<br>gap 32px<br>768×480 | column<br>gap 40px<br>1280×540 | column<br>gap 40px<br>1920×810 |

### collections

| путь в секции | 375 | 768 | 1280 | 1920 |
|---|---|---|---|---|
| `div>ul` | cols: 343px<br>gap 16px<br>343×1181 | cols: 218.656px 218.672px 218.672px<br>gap 16px<br>688×292 | cols: 362.656px 362.672px 362.656px<br>gap 16px<br>1120×407 | cols: 429.328px 429.328px 429.344px<br>gap 16px<br>1320×474 |

### featured

| путь в секции | 375 | 768 | 1280 | 1920 |
|---|---|---|---|---|
| `div>div` | column<br>gap 24px<br>343×808 | column<br>gap 32px<br>688×1378 | row<br>gap 40px<br>1120×686 | row<br>gap 40px<br>1320×788 |
| `div>div>div>div` | row<br>gap 8px<br>343×27 | column<br>gap 12px<br>688×124 | column<br>gap 12px<br>530×124 | column<br>gap 12px<br>628×124 |
| `div>div>div` | column<br>gap 12px<br>343×124 | column<br>gap 40px<br>688×522 | column<br>gap 40px<br>530×522 | column<br>gap 40px<br>628×522 |
| `div>div>button` | row<br>gap 8px<br>123×44 | — | — | — |
| `div>div>div>div>div` | — | row<br>gap 8px<br>688×30 | row<br>gap 8px<br>530×30 | row<br>gap 8px<br>628×30 |
| `div>div>div>div>button` | — | row<br>gap 8px<br>688×44 | row<br>gap 8px<br>530×44 | row<br>gap 8px<br>628×44 |

### popular

| путь в секции | 375 | 768 | 1280 | 1920 |
|---|---|---|---|---|
| `div>ul` | cols: 163.5px 163.5px<br>gap 16px<br>343×683 | cols: 160px 160px 160px 160px<br>gap 16px<br>688×336 | cols: 268px 268px 268px 268px<br>gap 16px<br>1120×444 | cols: 318px 318px 318px 318px<br>gap 16px<br>1320×494 |

### gallery

| путь в секции | 375 | 768 | 1280 | 1920 |
|---|---|---|---|---|
| `div>div` | column<br>gap 16px<br>343×657 | column<br>gap 16px<br>688×1180 | cols: 740.797px 363.203px<br>gap 16px<br>1120×787 | cols: 875px 429px<br>gap 16px<br>1320×894 |
| `div>div>div` | cols: 163.5px 163.5px<br>gap 16px<br>343×298 | cols: 336px 336px<br>gap 16px<br>688×476 | column<br>gap 16px<br>363×787 | column<br>gap 16px<br>429×894 |

### Footer

| путь в секции | 375 | 768 | 1280 | 1920 |
|---|---|---|---|---|
| `div` | column<br>gap 40px<br>375×837 | column<br>gap 80px<br>768×574 | column<br>gap 80px<br>1280×574 | column<br>gap 80px<br>1480×574 |
| `div>section` | column<br>gap 40px<br>343×544 | row<br>gap 40px<br>688×192 | row<br>gap 40px<br>1120×192 | row<br>gap 40px<br>1320×192 |

## Отличия набора `local-live` от `reference`

### viewport 375

- Высота документа: reference=5620 → local-live=4054 (Δ -1566)
- Секций: reference=8 → local-live=8

| секция | y (эталон→локал) | h (эталон→локал) | Δh | вердикт |
|---|---|---|---:|---|
| Header | 48→48 (Δ0) | 80→80 | 0 | ✓ совпадает |
| hero-title | 128→128 (Δ0) | 380→280 | -100 | ✗ расходится |
| collections | 508→408 (Δ-100) | 1322→564 | -758 | ✗ расходится |
| featured | 1830→972 (Δ-858) | 888→844 | -44 | ✗ расходится |
| popular | 2718→1815 (Δ-902) | 904→688 | -216 | ✗ расходится |
| cta-title | 3621→2503 (Δ-1118) | 361→551 | 190 | ⚠️ РАЗНЫЕ: cta-title vs main-child-4 |
| gallery | 3982→3054 (Δ-928) | 737→662 | -75 | ⚠️ РАЗНЫЕ: gallery vs main-child-5 |
| Footer | 4719→3715 (Δ-1003) | 901→339 | -562 | ✗ расходится |

### viewport 768

- Высота документа: reference=5527 → local-live=5165 (Δ -362)
- Секций: reference=8 → local-live=8

| секция | y (эталон→локал) | h (эталон→локал) | Δh | вердикт |
|---|---|---|---:|---|
| Header | 48→48 (Δ0) | 136→136 | 0 | ✓ совпадает |
| hero-title | 184→184 (Δ0) | 480→360 | -120 | ✗ расходится |
| collections | 664→544 (Δ-120) | 486→431 | -55 | ✗ расходится |
| featured | 1150→975 (Δ-175) | 1506→1366 | -140 | ✗ расходится |
| popular | 2656→2341 (Δ-315) | 611→483 | -128 | ✗ расходится |
| cta-title | 3267→2824 (Δ-443) | 315→872 | 558 | ⚠️ РАЗНЫЕ: cta-title vs main-child-4 |
| gallery | 3581→3696 (Δ114) | 1308→1110 | -198 | ⚠️ РАЗНЫЕ: gallery vs main-child-5 |
| Footer | 4889→4806 (Δ-84) | 638→359 | -279 | ✗ расходится |

### viewport 1280

- Высота документа: reference=4726 → local-live=4460 (Δ -266)
- Секций: reference=8 → local-live=8

| секция | y (эталон→локал) | h (эталон→локал) | Δh | вердикт |
|---|---|---|---:|---|
| Header | 48→48 (Δ0) | 136→136 | 0 | ✓ совпадает |
| hero-title | 184→184 (Δ0) | 540→480 | -60 | ✗ расходится |
| collections | 724→664 (Δ-60) | 602→602 | 0 | мелкое расхождение |
| featured | 1326→1266 (Δ-60) | 814→760 | -54 | ✗ расходится |
| popular | 2140→2025 (Δ-115) | 719→611 | -108 | ✗ расходится |
| cta-title | 2858→2636 (Δ-222) | 315→668 | 354 | ⚠️ РАЗНЫЕ: cta-title vs main-child-4 |
| gallery | 3173→3304 (Δ131) | 915→797 | -118 | ⚠️ РАЗНЫЕ: gallery vs main-child-5 |
| Footer | 4088→4101 (Δ13) | 638→359 | -279 | ✗ расходится |

### viewport 1920

- Высота документа: reference=5297 → local-live=4739 (Δ -558)
- Секций: reference=8 → local-live=8

| секция | y (эталон→локал) | h (эталон→локал) | Δh | вердикт |
|---|---|---|---:|---|
| Header | 48→48 (Δ0) | 136→136 | 0 | ✓ совпадает |
| hero-title | 184→184 (Δ0) | 810→480 | -330 | ✗ расходится |
| collections | 994→664 (Δ-330) | 668→655 | -13 | ✗ расходится |
| featured | 1662→1319 (Δ-343) | 916→780 | -136 | ✗ расходится |
| popular | 2578→2099 (Δ-479) | 769→651 | -118 | ✗ расходится |
| cta-title | 3347→2750 (Δ-597) | 291→748 | 458 | ⚠️ РАЗНЫЕ: cta-title vs main-child-4 |
| gallery | 3637→3498 (Δ-140) | 1022→883 | -139 | ⚠️ РАЗНЫЕ: gallery vs main-child-5 |
| Footer | 4659→4380 (Δ-279) | 638→359 | -279 | ✗ расходится |

