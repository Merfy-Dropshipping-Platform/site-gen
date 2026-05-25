export const CartCheckoutButtonClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'max-w-[768px] mx-auto px-4 sm:px-6 flex justify-end',
  btn:
    'cart-checkout-btn flex items-center justify-center [font-family:var(--font-body)] cursor-pointer transition-colors border-0 no-underline bg-[rgb(var(--color-button-bg))]! text-[rgb(var(--color-button-text))]! hover:bg-[rgb(var(--color-button-bg-hover))]! hover:text-[rgb(var(--color-button-text-hover))]!',
} as const;
