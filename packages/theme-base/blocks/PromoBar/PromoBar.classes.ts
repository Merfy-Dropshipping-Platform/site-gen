// PromoBar — top promo strip (Figma flux 1:26341).
// Black background with white uppercase text + underlined link.
export const PromoBarClasses = {
  root:
    'w-full bg-black text-white',
  container:
    'flex items-center justify-center px-4 py-[14px] min-h-[48px]',
  text:
    '[font-family:var(--font-body)] font-light text-[14px] leading-[20px] uppercase text-white',
  link:
    'underline underline-offset-2 hover:opacity-80 transition-opacity',
} as const;
