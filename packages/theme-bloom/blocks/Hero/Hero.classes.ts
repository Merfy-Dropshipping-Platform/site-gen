// Bloom Hero — pixel-matched to Figma 669:15290 ("Фото & Текст").
// Split variant is edge-to-edge: white text column on the left (bottom-aligned),
// edge-to-edge image column on the right. Accent-pink heading (kicker-style,
// 20px Urbanist uppercase), 16px Inter body, pink pill CTA.
// Centered / overlay / grid-4 variants keep base-like behaviour with Bloom tokens.
export const HeroClasses = {
  root: 'relative w-full overflow-hidden bg-[rgb(var(--color-bg))]',
  container: 'w-full',
  inner: {
    centered:
      'mx-auto max-w-[var(--container-max-width)] flex flex-col items-center text-center py-[80px] md:py-[120px] px-4 md:px-[60px]',
    split: 'flex flex-col md:flex-row items-stretch w-full min-h-[560px] md:min-h-[720px]',
    overlay:
      'relative min-h-[560px] md:min-h-[720px] flex flex-col items-center justify-center text-center py-[80px] md:py-[120px] px-4 md:px-[60px]',
    'grid-4':
      'mx-auto max-w-[var(--container-max-width)] flex flex-col items-center text-center py-[80px] md:py-[120px] px-4 md:px-[60px] gap-8',
  },
  // Text column — white background, bottom-aligned text block, large bottom inset.
  textCol:
    'flex-1 min-w-0 flex flex-col justify-end gap-[24px] bg-[rgb(var(--color-bg))] px-6 md:px-[80px] lg:px-[120px] py-[60px] md:py-[100px] lg:py-[120px]',
  // Image column — edge-to-edge right half.
  imageCol: 'flex-1 min-w-0 relative min-h-[320px] md:min-h-full',
  // Kicker = subtitle rendered above title (Bloom style: small body copy).
  kicker:
    '[font-family:var(--font-body)] text-[14px] md:text-[16px] leading-[1.6] text-[rgb(var(--color-text))]',
  // Title = small uppercase pink accent heading (20px Urbanist).
  title:
    '[font-family:var(--font-heading)] text-[20px] leading-[1.3] tracking-[0.08em] uppercase text-[rgb(var(--color-accent))]',
  subtitle:
    '[font-family:var(--font-body)] text-[14px] md:text-[16px] leading-[1.6] text-[rgb(var(--color-text))]',
  // Pink pill CTA — primary button colors + pill radius from theme tokens.
  ctaButton:
    'inline-flex items-center justify-center self-start h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-8 text-[14px] md:text-[15px] tracking-[0.04em] [font-family:var(--font-body)] border border-[rgb(var(--color-button-border))] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] hover:opacity-90 transition-colors no-underline',
  image: {
    centered: 'absolute inset-0 -z-10 object-cover w-full h-full',
    split: 'absolute inset-0 object-cover w-full h-full',
    overlay: 'absolute inset-0 -z-10 object-cover w-full h-full opacity-60',
    'grid-4': 'w-full aspect-square object-cover rounded-[var(--radius-media)]',
  },
  gridContainer:
    'w-full max-w-[var(--container-max-width)] grid grid-cols-2 gap-4 md:gap-6 lg:gap-8',
  gridTile:
    'relative overflow-hidden rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))] aspect-square',
} as const;
