export const HeroVariants = {
  centered: { textAlign: 'center', imagePosition: 'background' },
  split: { textAlign: 'left', imagePosition: 'right' },
  overlay: { textAlign: 'center', imagePosition: 'fullbleed-behind' },
  'grid-4': { textAlign: 'center', imagePosition: 'grid-above-text' },
  // 089 bloom pilot — additive variant. Edge-to-edge split layout with
  // bottom-aligned text column + full-height image column + uppercase
  // accent-color kicker (Bloom signature). Pre-089 variant values
  // (centered/split/overlay/grid-4) remain unchanged.
  'split-bloom': { textAlign: 'left', imagePosition: 'right-fullbleed' },
} as const;
