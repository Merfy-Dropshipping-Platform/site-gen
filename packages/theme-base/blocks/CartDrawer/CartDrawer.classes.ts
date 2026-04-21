export const CartDrawerClasses = {
  root: 'fixed top-0 bottom-0 w-[360px] max-w-full bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))] z-50 flex flex-col',
  position: {
    left: 'left-0 border-r border-[rgb(var(--color-bg))]',
    right: 'right-0 border-l border-[rgb(var(--color-bg))]',
  },
  header: 'flex items-center justify-between px-4 py-3 border-b border-[rgb(var(--color-bg))]',
  heading: '[font-family:var(--font-heading)] text-[length:var(--size-hero-heading)] text-[rgb(var(--color-heading))]',
  closeBtn: 'p-2 text-[rgb(var(--color-text))] bg-transparent border-0 cursor-pointer',
  items: 'flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3',
  empty: '[font-family:var(--font-body)] text-[rgb(var(--color-text))] opacity-60 text-center py-8',
  footer: 'px-4 py-3 border-t border-[rgb(var(--color-bg))] flex flex-col gap-3',
  total: 'flex items-center justify-between [font-family:var(--font-body)] text-[rgb(var(--color-text))]',
  checkoutBtn: 'h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] [font-family:var(--font-body)] text-center flex items-center justify-center no-underline',
} as const;
