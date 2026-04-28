// Per Figma 1:13562 — Manrope regular 12/400, color muted, leading 1.22, links underlined.
export const CheckoutTermsClasses = {
  root: 'w-full',
  text: '[font-family:var(--font-body)] text-[length:var(--size-tiny)] text-[rgb(var(--color-muted))] leading-[1.22]',
  link: 'underline underline-offset-2 text-[rgb(var(--color-muted))] hover:no-underline',
} as const;
