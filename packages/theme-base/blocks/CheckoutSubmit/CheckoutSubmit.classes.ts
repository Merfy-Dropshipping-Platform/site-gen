// Per Figma 1:13560 — button 56h, radius 4, fill black (button-bg), text white (button-text), Manrope 16/400.
// Use --color-button-* (always emitted by theme generator) instead of --color-accent which is missing in current scheme CSS output.
// Trailing `!` forces important to beat Tailwind preflight `button,[type=submit]{background-color:#0000}`.
export const CheckoutSubmitClasses = {
  root: 'w-full',
  buttonFill: 'w-full h-14 bg-[rgb(var(--color-button-bg))]! text-[rgb(var(--color-button-text))]! rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[length:var(--size-body)] hover:opacity-90 disabled:opacity-50',
  buttonOutline: 'w-full h-14 bg-transparent! text-[rgb(var(--color-text))] border-2 border-[rgb(var(--color-text))] rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[length:var(--size-body)] hover:bg-[rgb(var(--color-text)/.06)] disabled:opacity-50',
  buttonGradient: 'w-full h-14 bg-[rgb(var(--color-button-bg))]! text-[rgb(var(--color-button-text))]! rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[length:var(--size-body)] disabled:opacity-50',
} as const;
