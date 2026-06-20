export const PageClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  // Left-aligned constrained content column (Figma 1:19953 — ~768px, left).
  column: 'max-w-[768px]',
  // Prose typography for the sanitized set:html body. Targets child elements
  // (h2/h3/p/ul/ol/li/a/strong/em/blockquote) since the HTML is injected.
  content: [
    '[font-family:var(--font-body)] text-[length:var(--size-body,16px)] leading-[1.6] text-[rgb(var(--color-text))]',
    '[&_h2]:[font-family:var(--font-heading)] [&_h2]:text-[24px] [&_h2]:font-normal [&_h2]:leading-[1.2] [&_h2]:text-[rgb(var(--color-heading))] [&_h2]:mt-8 [&_h2]:mb-3 [&_h2:first-child]:mt-0',
    '[&_h3]:[font-family:var(--font-heading)] [&_h3]:text-[20px] [&_h3]:font-normal [&_h3]:leading-[1.3] [&_h3]:text-[rgb(var(--color-heading))] [&_h3]:mt-6 [&_h3]:mb-2',
    '[&_p]:mb-4 [&_p:last-child]:mb-0',
    '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_li]:mb-1',
    '[&_a]:text-[rgb(var(--color-accent))] [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-80',
    '[&_strong]:font-semibold [&_b]:font-semibold [&_em]:italic [&_i]:italic',
    '[&_blockquote]:border-l-2 [&_blockquote]:border-[rgb(var(--color-text))]/20 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4',
  ].join(' '),
  placeholder:
    '[font-family:var(--font-body)] text-[length:var(--size-body,16px)] leading-[1.6] text-[rgb(var(--color-muted))]',
} as const;
