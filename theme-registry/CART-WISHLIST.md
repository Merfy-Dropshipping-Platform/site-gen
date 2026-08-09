# Корзина и Избранное: как устроено у Rose → что переносить на Flux

Изучено по коду: rose = origin/main (актуальный эталон, `/tmp/sites-registry-fixes`),
flux = ветка `flux-constructor-live-markup`. Дата: 2026-08-09.

## Rose — корзина (4 слоя)

1. **Единое ядро** `packages/theme-base/runtime/nt-cart.ts` — бизнес-логика для ВСЕХ тем:
   - localStorage-стор (get/save), `addToCart` **с `variantCombinationId`** (уходит в
     backend cart → `order_items`), remove/qty/count/total;
   - делегат кликов `initCartUI` по data-контракту: `[data-add-to-cart]`
     (+ `data-product-id/-name/-price/-old-price/-image/-quantity/-variant-color/-size/-variant-combination-id`),
     бейдж `[data-cart-count]`, области `[data-cart-empty|items|summary|total]`,
     управление строкой `[data-cart-remove|inc|dec]` (+ data-id);
   - reconcile/самолечение (июльская серия rose: пере-матчинг стейл-строк после смены
     цены/реседа, variantImage, storefront-fallback);
   - события `<тема>:cart:*`.
   Per-theme в ядре — ТОЛЬКО `renderDrawerItem` (разметка строки дровера).

2. **Тема-обёртка** `themes/rose/src/lib/cart.ts` (тонкая):
   `createNtCart({ storageKey:'rose:cart:v1', eventPrefix:'rose:cart', renderDrawerItem })`
   + WebP-превью строки (`cart-thumb-html.ts`).

3. **Дровер** — DS `NtCartDrawer` в Layout (`#cart-drawer-root`):
   - открытие: capture-перехватчик StorefrontRuntime → событие `rose:cart:open`
     (svg-фикс: клик в `<svg>` ≠ HTMLElement — уже портирован на все темы);
   - «Вид корзины» = токен `--cart-type` (Theme Settings) → drawer | page;
   - тексты/схема дровера из билда: глобалы `__MERFY_CART_DRAWER_SCHEME__ /
     _DISCLAIMER__ / _TITLE__ / _CHECKOUT__ / _EMPTY__` — рантайм применяет.

4. **Страница /cart** — split (spec 110, `CART_SPLIT_THEMES={rose}` в
   `revision-migrations.ts`): миграция делит корзину на блоки
   `CartBody` (список + пустое состояние) + `CartSummary` («Итого» + «Оформить»)
   + `CartTotals` + `CartCheckoutButton`.
   ⚠️ Нюанс: рантайм СТРАНИЦЫ у rose — «ванильная getCart/render + cart-store.js /
   cart-api.js», НЕ nt-cart (комментарий в CartBody.astro: «рантайм несовместим») —
   т.е. у rose ДВА рантайма: nt-cart (дровер + кнопки секций) и cart-store
   (страница + синк на сервер/чекаут).
   ⚠️ Блокер реестра: Cart*-блоки НЕ штампуют `data-puck-component-id` в рендере
   (канал конструктора к ним не адресуем) — общий для rose и flux.

## Rose — избранное

- `themes/rose/src/lib/wishlist.ts` (~200 строк): localStorage `rose:wishlist:v1`
  (список productId), `toggle()` → новое состояние, CustomEvent при изменении,
  кросс-вкладочный sync (storage event), window-глобал для inline-скриптов
  (каталог/PDP-гидрация читают синхронно), делегат `initWishlistUI`
  (сердце на карточках, счётчик).
- Шапка: иконка-ссылка `/wishlist` + бейдж `data-wishlist-count`
  (в обоих вариантах раскладки шапки).
- Страница `/wishlist` (`themes/rose/src/pages/wishlist.astro`) — рендер из localStorage.

## Flux — что уже есть / чего не хватает

| слой | rose | flux сейчас | вердикт |
|---|---|---|---|
| Ядро корзины | общее `nt-cart.ts` | **ФОРК** `nt-cart-flux.ts` (280 строк, `reconcile` = 0) | ❌ мигрировать |
| Обоснование форка | — | «пакетный nt-cart не имеет variantCombinationId» — **УСТАРЕЛО** (ядро несёт его давно) | снять |
| Импортёры форка | — | 8 файлов: CartSection, Popular, FeaturedProduct, FluxProductDetail, storefront-hydrate, cart-thumb-html, cart.ts, packages/theme-flux Catalog | перевести на ядро |
| storageKey | rose:cart:v1 | flux:cart:v1 | ✅ сохранить при миграции (корзины покупателей!) |
| Дровер + svg-открытие | ✓ | ✓ (`flux:cart:open`, b6aadd52) | ✅ есть |
| Тексты/схема дровера (Фаза 2) | ✓ | ✓ (портировано) | ✅ есть |
| «Вид корзины» --cart-type | ✓ | ✓ | ✅ есть |
| Страница /cart split-блоками | ✓ (миграция) | ревизия юзера УЖЕ split-состава (рендер theme-base-блоками), но flux НЕ в `CART_SPLIT_THEMES`; порт `CartSection.astro` жив параллельно | ⚠️ включить flux в split + решить судьбу CartSection |
| Reconcile/самолечение | ✓ в ядре | ❌ (форк без него) | приедет с миграцией |
| Wishlist lib/страница/делегат | ✓ | ✓ (`flux:wishlist:v1`, wishlist.astro, initWishlistUI в карточке/PDP/Layout) | ✅ есть |
| Wishlist в шапке | иконка+счётчик в desktop и mobile | только в МОБИЛЬНОЙ строке; desktop-шапка без сердца — КАНОН верстальщиков flux (3 иконки: search/cart/user) | ❓ решение: канон vs паритет |

## План «сделать так же на флюксе» (атомарно)

1. **Миграция ядра** (главный шаг): `themes/flux/src/lib/cart.ts` → импорт
   `createNtCart` из `packages/theme-base/runtime/nt-cart` (storageKey/eventPrefix
   не менять!), flux `renderDrawerItem` сохранить; перевести 8 импортёров;
   `nt-cart-flux.ts` — удалить после зелёных проверок. Даёт reconcile,
   variantImage, storefront-fallback «бесплатно». ⚠️ ветка отстаёт от main —
   свежую версию ядра брать с origin/main (в worktree она июньская!).
2. `cart-api.js addItem` — проверить параметр `options` (июльский хвост).
3. Страница корзины: добавить flux в `CART_SPLIT_THEMES` (на main) + блокер
   puck-id у Cart*-блоков (общий заход с rose).
4. Wishlist: решить вопрос desktop-шапки (канон без сердца vs паритет с rose) —
   решение владельца; остальное уже паритетно.
5. Реестр: волна «интерактив» — контракты действий (add→бейдж→дровер→qty;
   wishlist toggle→счётчик→страница) — новый тип проверок с кликами.
