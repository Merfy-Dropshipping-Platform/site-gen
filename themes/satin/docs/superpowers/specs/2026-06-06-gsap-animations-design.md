# Дизайн: слой GSAP-анимаций для темы Satin

Дата: 2026-06-06
Статус: утверждён пользователем

## Цель

Добавить в статичную Astro-тему Satin слой интерактивных анимаций на GSAP:
1. Появление секций при прокрутке (fade + лёгкий боковой сдвиг).
2. Hover-эффект карточек товара: 3D-наклон за курсором + подъём.
3. Кнопка «В корзину»: скрыта по умолчанию, плавно появляется при наведении.
4. Поиск с автозаполнением: клиентский поиск + анимированная выпадашка подсказок.
5. Drawer корзины: переписать выезжание на GSAP (поверх событий дизайн-системы).

## Контекст (фактическое состояние темы)

- **Стек:** Astro 5 + Tailwind v4, контент статичный. React в рантайме отсутствует (есть только `src/puck/config.tsx` — это редактор Puck, не сторефронт). Вся интерактивность — **vanilla JS** в `<script>`-тегах `.astro`-компонентов с делегированием событий и `data-*`-атрибутами.
- **Корзина:** компонент дизайн-системы `NtCartDrawer` (`@merfy-dropshipping-platform/design-systems-theme`). Drawer уже анимируется CSS-переходом (`translate-x-full → translate-x-0`, `transition-transform duration-300 ease-out`, оверлей `opacity`). Состояние — атрибут `data-state` на корне (`#satin-cart-drawer-root`) и потомках (`[data-cart-panel]`, оверлей). Управление — события `satin:cart:open|close|toggle`. При клике `[data-add-to-cart]` библиотека сама диспатчит `:open` (drawer выезжает автоматически — **уже работает**).
- **Карточка товара:** `src/components/products/SatinProductCard.astro`. Корень `<article class="group ..." data-nt="satin-product-card">`. У картинки уже есть `group-hover:scale-[1.03]`. Кнопка `[data-add-to-cart]` сейчас **всегда видима**.
- **Секции:** `src/components/sections/*` — семантические `<section>`; домашняя страница `src/pages/index.astro` собирает их подряд.
- **Поиск:** в `Header.astro` форма сабмитит `GET /catalog?q=`. Автозаполнения и клиентского индекса нет. Данные товаров — `src/data/products.ts` (`catalogProducts`).
- **Стили:** Tailwind v4 + `src/styles/global.css` (`@import "tailwindcss"`), CSS-переменные `--satin-*`. CSS-модулей нет.
- **GSAP:** установлен `gsap@3.15.0`. `@gsap/react@2.1.2` установлен ошибочно (React в рантайме не используется) — будет удалён.

## Общие принципы реализации

- **Только vanilla GSAP** в Astro-`<script>`. React не вводим.
- **`prefers-reduced-motion`:** все анимации обёрнуты в `gsap.matchMedia()`; для reduced-motion — мгновенное появление без сдвигов/наклонов.
- **Производительность:** анимируем только `transform`/`opacity`; слежение за курсором — через `gsap.quickTo`; появление секций — `ScrollTrigger.batch`.
- **Идемпотентность и устойчивость:** скрипты проверяют наличие элементов, безопасно работают при их отсутствии.
- **Доступность:** reveal кнопки срабатывает и на `focus-within`; клавиатурная навигация в поиске; на тач-устройствах кнопка «В корзину» остаётся видимой.

## Архитектура файлов

### Новые
- `src/scripts/gsap/core.ts` — `gsap.registerPlugin(ScrollTrigger)`, хелпер reduced-motion, реэкспорт `gsap`/`ScrollTrigger`.
- `src/scripts/gsap/sections.ts` — появление секций при скролле.
- `src/scripts/gsap/product-card.ts` — 3D-наклон, подъём, reveal кнопки.
- `src/scripts/gsap/search.ts` — клиентский поиск и анимированная выпадашка.
- `src/scripts/gsap/cart-drawer.ts` — GSAP-анимация drawer поверх событий DS.
- `src/scripts/gsap/index.ts` — единая точка входа; импортирует sections/cart-drawer (и при необходимости product-card/search, если их не подключать из компонентов).
- `src/styles/gsap-overrides.css` — нейтрализация CSS-перехода и завязки видимости DS у drawer; базовое скрытие кнопки «В корзину» на hover-устройствах (CSS-фолбэк до загрузки JS).

### Правки
- `src/layouts/Layout.astro` — импорт entry-скрипта GSAP (после `initCartUI()`), подключение `gsap-overrides.css`.
- `src/components/products/SatinProductCard.astro` — perspective-обёртка/хуки для наклона; разметка/атрибуты, чтобы кнопка была скрыта по умолчанию на hover-устройствах.
- `src/components/Header.astro` — `<script type="application/json">` с индексом поиска из `catalogProducts`; контейнер выпадашки под строкой поиска.
- `package.json` — удалить `@gsap/react`.

## Детали по фичам

### 1. Секции при прокрутке (`sections.ts`)
- Цель: верхнеуровневые `<main> section`.
- Анимация входа: `opacity 0→1`, `y 24→0`, боковой сдвиг `x ±32→0` (чётные секции слева, нечётные справа — ощущение движения), старт `top 85%`, плавный stagger.
- Опционально: stagger дочерних карточек по `[data-reveal-item]` внутри гридов.
- Reduced-motion: только `opacity`, без сдвигов.

### 2. Карточка товара: 3D-наклон + подъём (`product-card.ts`)
- Цель: `[data-nt="satin-product-card"]`.
- Контейнер получает `perspective`; на `pointermove` считаем `rotateX/rotateY` от позиции курсора, применяем через `quickTo` (плавно).
- На вход: подъём `y:-6` + мягкая тень. На уход: плавный сброс наклона и подъёма.
- Картинка сохраняет существующий `scale-[1.03]`.
- Активируется только при `(hover: hover)` и fine-pointer; иначе не вешаем обработчики.
- Reduced-motion: отключено.

### 3. Кнопка «В корзину»: reveal на hover
- На hover-устройствах кнопка по умолчанию `opacity:0`, `translateY:8` (CSS-фолбэк в `gsap-overrides.css`, чтобы не было «прыжка» до JS).
- GSAP: на вход в карточку — проявление снизу; на уход — скрытие. Также reveal на `focus-within` (клавиатура).
- На тач-устройствах (`hover: none`) кнопка всегда видима.

### 4. Поиск с автозаполнением (`search.ts` + `Header.astro`)
- В `Header.astro` встроить `<script type="application/json" id="satin-search-index">` с массивом `{ id, name, price, image, href }` из `catalogProducts` (сборка на этапе билда, без рантайм-запросов).
- Клиентский скрипт: debounce ввода, фильтр по подстроке имени (без учёта регистра), рендер до ~6 подсказок в контейнер под строкой поиска.
- Анимация: контейнер `scaleY/opacity`, элементы — stagger; новые подсказки появляются плавно.
- Взаимодействие: клавиатура (↑/↓/Enter/Esc), клик по подсказке → переход на страницу товара; закрытие по Esc/клику вне.
- Reduced-motion: подсказки появляются мгновенно.
- Работает и для десктопной, и для мобильной строки поиска в `Header.astro`.

### 5. Drawer корзины на GSAP (`cart-drawer.ts` + `gsap-overrides.css`)
- В `gsap-overrides.css`: для `[data-nt="cart-drawer"]` глушим `transition` у `[data-cart-panel]` и оверлея и снимаем завязку видимости DS (чтобы анимацию закрытия было видно), отдавая видимость/`pointer-events` под управление GSAP (`autoAlpha`).
- В `cart-drawer.ts`: слушаем `satin:cart:open|close|toggle` (плюс MutationObserver на `data-state` как фолбэк) и гоним:
  - панель: `xPercent 100→0` (открытие, ease с лёгким overshoot, например `back.out`/`power3.out`) и `0→100` (закрытие);
  - оверлей: `opacity 0→1`/`1→0`;
  - корень: видимость/`pointer-events` (включаем перед открытием, выключаем после завершения закрытия).
- Согласованность с DS: не дублировать переключение состояния — наш скрипт только анимирует визуал, DS остаётся источником данных/состояния. Инлайновый `transform` от GSAP перекрывает Tailwind-классы DS.

## Риски и компромиссы

- **Завязка на внутреннюю разметку DS** (`[data-cart-panel]`, `[data-state]`, события `satin:cart:*`). При обновлении `@merfy-dropshipping-platform/design-systems-theme` GSAP-обёртка drawer может потребовать правки. Это сознательный компромисс ради выбранного варианта «переписать на GSAP».
- **Поиск** работает по локальному индексу `catalogProducts`; при переходе на реальный бэкенд-поиск логика фильтра заменяется на запрос (анимация выпадашки переиспользуется).
- **Тестов в теме нет.** Вводить тест-раннер ради этой задачи вне объёма; проверка — `pnpm build` + ручной смок через `preview`.

## Проверка

- `pnpm build` проходит без ошибок.
- Ручной смок через `build + preview`: скролл-появление секций, наклон/подъём карточек и reveal кнопки на десктопе, видимость кнопки на тач-эмуляции, выпадашка поиска, открытие/закрытие drawer корзины (в т.ч. авто-открытие при добавлении), поведение при `prefers-reduced-motion`.
