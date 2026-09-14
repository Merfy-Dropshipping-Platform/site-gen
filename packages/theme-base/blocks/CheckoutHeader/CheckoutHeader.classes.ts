export const CheckoutHeaderClasses = {
  // Per Figma 1:13563 — full-width bar, content centered in standard theme container.
  // Figma spec: 1920 viewport, padding 300/300 → content 1320. Rose container is 1280
  // (~40px diff, не визуально). Layout's summary bg extends past header right edge
  // (full-bleed) — это by design Figma 1:13398.
  // Spec 109 — sticky к верху (как основная шапка). Обёртка схемы на checkout
  // должна быть display:contents (Layout header="checkout"), иначе containing-block
  // голодает и sticky не работает.
  //
  // ⚠️ НА СТРАНИЦЕ ЧЕКАУТА `sticky` перекрыт (2026-09-14, п.3 владельца:
  // «отделить от левой и правой части и придать свои размеры»). Шапка идёт
  // ОТДЕЛЬНОЙ полосой над обеими колонками (CheckoutSplit, слот `header`), и
  // общая split-таблица (packages/theme-base/blocks/CheckoutLayout/
  // checkout-split.ts) делает её `position: static`, чтобы полоса не наезжала
  // на липкую сводку. Фон и палитру у неё больше НЕ отнимают: третий круг
  // гасил их, пока шапка жила внутри колонки, — теперь её собственная
  // «Цветовая схема» снова работает. Правки поведения на чекауте делаются в
  // split-таблице, а не тут.
  root: 'sticky top-0 z-50 w-full bg-[rgb(var(--color-bg))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4 md:px-8 py-6 flex items-center justify-between',
  // Logo per Figma — Comfortaa display font; theme `--font-heading` остаётся fallback.
  brand: "[font-family:'Comfortaa',var(--font-heading)] text-[length:var(--size-checkout-brand)] text-[rgb(var(--color-heading))] no-underline tracking-wide",
  brandImage: 'h-[var(--size-checkout-brand-image)] w-auto object-contain',
  iconRight: 'flex items-center justify-center w-8 h-8 text-[rgb(var(--color-heading))] hover:opacity-80',
} as const;
