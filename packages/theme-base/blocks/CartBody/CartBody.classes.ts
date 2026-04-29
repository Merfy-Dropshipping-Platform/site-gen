// CartBody — wrapper + empty/content states. Same UI as rose live cart.astro
// so constructor preview matches what users see on the live site.
export const CartBodyClasses = {
  root: 'relative w-full',
  container: 'max-w-[768px] mx-auto px-4 sm:px-6',
  heading: 'font-heading uppercase text-[24px] leading-[27px] text-[rgb(var(--color-foreground))] m-0 mb-[25px]',
  emptyOuter: '',
  emptyInner: 'flex flex-col items-center py-16 gap-4',
  emptyIcon: 'text-[rgb(var(--color-muted))]',
  emptyText: 'font-body text-[20px] leading-[27px] text-[rgb(var(--color-muted))]',
  emptyCta:
    'font-body inline-flex items-center justify-center px-6 py-3 ' +
    'bg-[rgb(var(--color-foreground))] text-[rgb(var(--color-background))] ' +
    'text-[16px] leading-[22px] rounded-[8px] no-underline',
  content: '',
  items: 'flex flex-col gap-[50px]',
} as const;
