// Video block — renders embedded YouTube/Vimeo/mp4, or a visible
// placeholder with play icon when URL is absent (instead of an empty
// black rectangle). Heading follows Rose's 14px uppercase tracked style.
export const VideoClasses = {
  root:
    'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container:
    'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    '[font-family:var(--font-heading)] text-[14px] leading-[16px] tracking-[0.1em] uppercase text-[rgb(var(--color-heading))] text-center mb-10',
  media:
    'relative w-full aspect-video overflow-hidden rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))]',
  iframe:
    'absolute inset-0 h-full w-full border-0',
  video:
    'absolute inset-0 h-full w-full object-cover',
  placeholder:
    'absolute inset-0 flex flex-col items-center justify-center gap-3 text-[rgb(var(--color-text))]/50',
  placeholderIcon:
    'w-16 h-16 rounded-full border-2 border-current flex items-center justify-center',
  placeholderText:
    '[font-family:var(--font-body)] text-[14px] leading-[17px]',
} as const;
