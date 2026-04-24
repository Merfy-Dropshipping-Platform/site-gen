// Satin Hero — pixel-matched to Figma 681:11674 (Hero Satin Deckstop).
// Split variant is edge-to-edge (NOT constrained): left text half on white,
// right image half with 10% dark overlay. Fixed 680px height.
// Centered/overlay variants keep base-like behaviour with Satin tokens.
export const HeroClasses = {
  root: 'relative w-full overflow-hidden bg-[rgb(var(--color-bg))]',
  // For split-fullbleed: container spans full viewport width (no mx-auto max-width).
  container: 'w-full',
  inner: {
    centered: 'mx-auto max-w-[var(--container-max-width)] flex flex-col items-center text-center py-[120px] px-[300px]',
    split: 'flex flex-row items-stretch w-full h-[680px]',
    overlay: 'relative min-h-[680px] flex flex-col items-center justify-center text-center py-[120px] px-[300px]',
    'grid-4': 'mx-auto max-w-[var(--container-max-width)] flex flex-col items-center text-center py-[120px] px-[300px] gap-8',
  },
  // Text column — white bg, left-aligned, 120px vertical + 300px horizontal inset.
  textCol:
    'flex-1 min-w-0 flex flex-col justify-center gap-[32px] bg-[rgb(var(--color-bg))] px-[300px] py-[120px]',
  // Image column — edge-to-edge right half with 10% dark overlay.
  imageCol: 'flex-1 min-w-0 relative h-full',
  kicker:
    "[font-family:var(--font-body)] text-[16px] uppercase text-[rgb(var(--color-muted))] leading-[normal]",
  title:
    "[font-family:var(--font-heading)] text-[32px] leading-[normal] text-[rgb(var(--color-heading))] uppercase whitespace-pre-line",
  ctaButton:
    "inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-4 [font-family:var(--font-body)] text-[16px] uppercase bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] border border-[rgb(var(--color-button-border))] hover:opacity-90 transition-colors no-underline self-start",
  // Centered/overlay/grid-4 fallbacks reuse base-style image classes.
  image: {
    centered: 'absolute inset-0 -z-10 object-cover w-full h-full',
    split: 'absolute inset-0 object-cover w-full h-full',
    overlay: 'absolute inset-0 -z-10 object-cover w-full h-full opacity-60',
    'grid-4': 'w-full aspect-square object-cover rounded-[var(--radius-media)]',
  },
  overlay: 'absolute inset-0 bg-black/10 pointer-events-none',
  gridContainer:
    'w-full max-w-[var(--container-max-width)] grid grid-cols-2 gap-4 md:gap-6 lg:gap-8',
  gridTile:
    'relative overflow-hidden rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))] aspect-square',
} as const;
