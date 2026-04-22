export const HeroVariants = {
  centered: { textAlign: 'center', imagePosition: 'background' },
  split: { textAlign: 'left', imagePosition: 'right' },
  overlay: { textAlign: 'center', imagePosition: 'fullbleed-behind' },
  'grid-4': { textAlign: 'center', imagePosition: 'grid-above-text' },
} as const;
