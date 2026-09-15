// Per Figma 1:13403 — heading Manrope 16/400, items gap 24, promo wrapper 56h with inner button (44h, 12px pad), 24px gap before promo.
// ФОН ПРОМОКОДА — «Фон» СХЕМЫ, а не замороженный `--color-input-bg`.
//
// Жалоба тестировщика 15.09 [52]: «Сводка заказа» — внутри белые пятна на
// каждом из пяти стендов. Замер (Chromium 1440, правая колонка чекаута, схемы
// мерчанта scheme-2 → scheme-3): обёртка колонки 251,251,251 → 90,175,255 идёт
// за `--color-checkout-surface`, а поле промокода и строка «промокод применён»
// 255,255,255 → 255,255,255 — замерли. Ровно два узла, во всех пяти темах.
//
// Причина: `--color-input-bg` стоит в реестре токенов со `scope: 'scheme'`
// (packages/theme-contract/tokens/registry.ts), но ни одна тема не кладёт его в
// `colorSchemes[].tokens`, и генератор печатает его только в `:root` — белым
// `255 255 255` у всех пяти тем. Та же болезнь, что была у `--color-muted`
// (14.09) и `--color-input-border` (15.09).
//
// Чиним НЕ генератором, а мишенью, и вот почему. `--color-input-bg` несёт ВСЕ
// поля чекаута (CheckoutContactForm, CheckoutDeliveryForm, баннер
// OrderConfirmation). 16.09: `inputBorderOf` в src/themes/tokens-css.ts
// больше не считает контраст — рамка везде цвета поля (точка 3, см. ниже).
// Двигать `--color-input-bg` — менять дизайн форм на пяти темах, а этого
// никто не просил. Здесь же нужны ровно два узла сводки, и они живут в
// одном месте — в этом файле, общем для пяти тем.
//
// Почему «Фон», а не «Поверхность»: раньше колонка сводки стояла на
// `--color-checkout-surface` (245/251), а поле здесь — на «Фоне» (255) той же
// схемы, и разница в 4-10 единиц отделяла поле от подложки без рамки.
//
// 16.09, ТОЧКА 1: `--color-checkout-surface` снят — колонка сама красится
// «Фоном» (см. `checkout-split.ts`). У поля промокода и подложки колонки
// теперь ОДИН И ТОТ ЖЕ источник цвета — контраст, на который опирался этот
// приём, исчез вместе с ним.
// 16.09, ТОЧКА 3: рамка (`--color-input-border`) тоже снята везде — она
// раньше держала поле, если контраст с подложкой был ниже 1.5.
// ИТОГО: на белых/светлых схемах (rose 1/2/3/5, satin 1/2/3, vanilla 3/4,
// bloom 3/4, flux 2/3 — 13 связок из 21, см. checkout-summary-scheme-surface.
// spec.ts) поле промокода визуально СЛИВАЕТСЯ и с подложкой, и с колонкой:
// ни цветового контраста, ни рамки. Это принятая владельцем деградация
// («убрать рамку» было дословным пунктом 3), не забытый баг.
// Сторож: pnpm test:scheme-targets, pnpm test:checkout-summary-scheme.
export const CheckoutOrderSummaryClasses = {
  root: 'w-full',
  // Figma 1:19998 — на десктопе сводка без заголовка (товары сразу на тон-панели).
  // На мобиле (сводка стекается под формой) заголовок остаётся ориентиром.
  heading: 'mb-4 lg:hidden [font-family:var(--font-body)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  items: 'flex flex-col gap-6',
  promo: 'mt-6 flex items-stretch h-14 border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] overflow-hidden bg-[rgb(var(--color-bg,255_255_255))] p-1.5 pl-3',
  promoLabel: 'flex-1 flex items-center text-[length:var(--size-body)] text-[rgb(var(--color-input-placeholder))]',
  // Use button-bg/button-text (always emitted by theme generator) — accent vars are missing from current scheme CSS.
  // Trailing `!` forces important to beat Tailwind preflight `button,[type=submit]{background-color:#0000}`.
  promoApply: 'px-3 bg-[rgb(var(--color-button-bg))]! text-[rgb(var(--color-button-text))]! text-[length:var(--size-small)] rounded-[var(--radius-button)]',
  // Applied-state row: показывает код + кнопку «убрать» вместо поля ввода.
  promoApplied: 'mt-6 flex items-center justify-between gap-3 h-14 border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] bg-[rgb(var(--color-bg,255_255_255))] px-3',
  promoAppliedCode: 'flex-1 truncate [font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]',
  // Кнопка снятия промокода (×). text-decoration-less, наследует muted.
  promoRemove: 'shrink-0 px-2 bg-transparent! [font-family:var(--font-body)] text-[length:var(--size-small)] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]',
  // Ошибка применения промокода (RU-текст от бэка). Паттерн как AuthModal.error.
  promoError: 'mt-2 [font-family:var(--font-body)] text-[length:var(--size-small)] text-[rgb(var(--color-error))]',
} as const;
