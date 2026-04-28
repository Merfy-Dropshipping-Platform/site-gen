// Per Figma 1:13562 — Montserrat Alternates 12/300 light, color muted, leading 1.22, links underlined.
export const CheckoutTermsClasses = {
  root: 'w-full',
  text: "[font-family:'Montserrat_Alternates',var(--font-body)] font-light text-[length:var(--size-tiny)] text-[rgb(var(--color-muted))] leading-[1.22]",
  link: 'underline underline-offset-2 text-[rgb(var(--color-muted))] hover:no-underline',
} as const;
