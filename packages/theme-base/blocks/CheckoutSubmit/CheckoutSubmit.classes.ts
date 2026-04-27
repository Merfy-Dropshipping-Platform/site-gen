export const CheckoutSubmitClasses = {
  root: 'w-full',
  buttonFill: 'w-full px-4 py-3 bg-[rgb(var(--color-accent))] text-[rgb(var(--color-accent-fg))] rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[length:var(--size-body)] font-semibold hover:opacity-90 disabled:opacity-50',
  buttonOutline: 'w-full px-4 py-3 bg-transparent text-[rgb(var(--color-accent))] border-2 border-[rgb(var(--color-accent))] rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[length:var(--size-body)] font-semibold hover:bg-[rgb(var(--color-accent)/.06)] disabled:opacity-50',
  buttonGradient: 'w-full px-4 py-3 bg-gradient-to-r from-[rgb(var(--color-accent))] to-[rgb(var(--color-accent-2))] text-[rgb(var(--color-accent-fg))] rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[length:var(--size-body)] font-semibold disabled:opacity-50',
} as const;
