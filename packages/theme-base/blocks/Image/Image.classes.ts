export const ImageClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  imageWrap: 'relative w-full overflow-hidden rounded-[var(--radius-media)]',
  image: 'absolute inset-0 w-full h-full object-cover',
  splitGrid: 'grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3',
  splitItem: 'relative w-full overflow-hidden rounded-[var(--radius-media)]',
  card: 'absolute bg-[rgb(var(--color-bg))]/95 backdrop-blur-sm p-6 rounded-[var(--radius-card)] max-w-[420px]',
  cardPos: {
    'card-bottom-left': 'bottom-6 left-6',
    'card-bottom-center': 'bottom-6 left-1/2 -translate-x-1/2',
    'card-bottom-right': 'bottom-6 right-6',
    'card-top-left': 'top-6 left-6',
    'card-top-center': 'top-6 left-1/2 -translate-x-1/2',
    'card-top-right': 'top-6 right-6',
    'card-middle-left': 'top-1/2 -translate-y-1/2 left-6',
  },
  heading:
    '[font-family:var(--font-heading)] text-[length:var(--size-section-heading,1.25rem)] font-normal leading-[1.2] text-[rgb(var(--color-heading))] mb-2',
  text:
    '[font-family:var(--font-body)] text-[16px] font-normal leading-[1.25] text-[rgb(var(--color-text))] mb-4',
  button:
    'inline-flex items-center justify-center h-[48px] px-4 text-[16px] font-normal hover:opacity-90 transition-colors [font-family:var(--font-body)] border-[1.3px] border-solid border-[rgb(var(--color-heading))] rounded-[var(--radius-button)] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))]',
  heights: {
    auto: 'aspect-[16/10]',
    small: 'h-[400px]',
    medium: 'h-[600px]',
    large: 'h-[800px]',
    full: 'h-screen min-h-[600px]',
  },
} as const;
