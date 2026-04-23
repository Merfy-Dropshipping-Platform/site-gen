export const VideoClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    '[font-family:var(--font-heading)] text-[var(--size-hero-heading)] text-[rgb(var(--color-heading))] mb-6 text-center',
  media:
    'relative w-full aspect-video overflow-hidden rounded-[var(--radius-media)] bg-black',
  iframe: 'absolute inset-0 h-full w-full border-0',
  video: 'absolute inset-0 h-full w-full object-cover',
} as const;
