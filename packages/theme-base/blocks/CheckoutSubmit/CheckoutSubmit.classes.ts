// Per Figma 1:13560 — button 56h, radius 4, fill black, text Manrope 16/400 (no semibold).
export const CheckoutSubmitClasses = {
  root: 'w-full',
  buttonFill: 'w-full h-14 bg-[rgb(var(--color-accent))] text-[rgb(var(--color-accent-fg))] rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[length:var(--size-body)] hover:opacity-90 disabled:opacity-50',
  buttonOutline: 'w-full h-14 bg-transparent text-[rgb(var(--color-accent))] border-2 border-[rgb(var(--color-accent))] rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[length:var(--size-body)] hover:bg-[rgb(var(--color-accent)/.06)] disabled:opacity-50',
  buttonGradient: 'w-full h-14 bg-gradient-to-r from-[rgb(var(--color-accent))] to-[rgb(var(--color-accent-2))] text-[rgb(var(--color-accent-fg))] rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[length:var(--size-body)] disabled:opacity-50',
} as const;
