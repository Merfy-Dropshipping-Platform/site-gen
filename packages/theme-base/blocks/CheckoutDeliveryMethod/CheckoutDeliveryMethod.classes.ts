export const CheckoutDeliveryMethodClasses = {
  root: 'w-full',
  // Per Figma 1:13501 — heading Manrope 16/400 mb-4; options 60h padding 12, title 14, price 12, subtitle 12 muted; gap 16 between cards.
  heading: 'mb-4 [font-family:var(--font-body)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  // Scrollable list — показываем ~3 карточки сразу, остальные в scroll.
  // max-h ≈ 3 × (py-4=32px + ~28 content) + 2 × gap-3 (12px) = ~244px.
  // Thin custom scrollbar (видно только на overflow).
  list: 'flex flex-col gap-3 max-h-[244px] overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgb(var(--color-muted)/.4)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[rgb(var(--color-muted)/.3)] [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[rgb(var(--color-muted)/.5)]',
  option: 'flex flex-col justify-center h-[60px] px-3 border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] cursor-pointer transition-colors hover:border-[rgb(var(--color-text)/.4)]',
  // Selected state — use --color-text (theme always defines it); accent vars missing from generator CSS.
  optionSelected: 'border-[rgb(var(--color-text))]',
  radio: 'sr-only',
  body: 'flex-1 flex flex-col',
  label: '[font-family:var(--font-body)] text-[length:var(--size-small)] text-[rgb(var(--color-text))]',
  meta: 'mt-0.5 text-[length:var(--size-tiny)] text-[rgb(var(--color-muted))]',
  price: '[font-family:var(--font-body)] text-[length:var(--size-tiny)] text-[rgb(var(--color-text))]',
} as const;
