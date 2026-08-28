export const CheckoutSummaryClasses = {
  // Прозрачный фон — тонирование даёт split-панель (.mfy-checkout-pane--summary,
  // --color-surface) в checkout.astro / preview.service.wrapCheckoutGrid (Figma 1:19998).
  root: 'relative w-full text-[rgb(var(--color-text))] flex flex-col gap-6',
} as const;
