// BlogPostSection — страница записи блога: ссылка на блог, заголовок, дата,
// обложка и текст. Колонка текста ~768px, как у секции «Страница»; типографика
// тела — та же, что у «Страницы» (Page.classes.ts `content`).
export const BlogPostSectionClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4 sm:px-5 md:px-10',
  column: 'mx-auto max-w-[768px]',
  back: '[font-family:var(--font-body)] inline-block text-[14px] leading-[18px] text-[rgb(var(--color-muted))] no-underline hover:text-[rgb(var(--color-heading))] mb-6',
  heading:
    '[font-family:var(--font-heading)] text-[28px] sm:text-[40px] leading-[1.2] font-normal text-[rgb(var(--color-heading))] mb-3',
  date: '[font-family:var(--font-body)] block text-[14px] leading-[18px] text-[rgb(var(--color-text))]/60 mb-8',
  cover:
    'block w-full aspect-[16/9] rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))] object-cover mb-8',
  content: [
    '[font-family:var(--font-body)] text-[length:var(--size-body,16px)] leading-[1.6] text-[rgb(var(--color-text))]',
    '[&_h2]:[font-family:var(--font-heading)] [&_h2]:text-[24px] [&_h2]:font-normal [&_h2]:leading-[1.25] [&_h2]:text-[rgb(var(--color-heading))] [&_h2]:mt-8 [&_h2]:mb-3',
    '[&_h3]:[font-family:var(--font-heading)] [&_h3]:text-[20px] [&_h3]:font-normal [&_h3]:leading-[1.3] [&_h3]:text-[rgb(var(--color-heading))] [&_h3]:mt-6 [&_h3]:mb-2',
    '[&_p]:mb-4 [&_p:last-child]:mb-0',
    '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_li]:mb-1',
    '[&_a]:text-[rgb(var(--color-accent))] [&_a]:underline [&_a]:underline-offset-2',
    '[&_img]:block [&_img]:max-w-full [&_img]:h-auto [&_img]:my-6 [&_img]:rounded-[var(--radius-media)]',
    '[&_strong]:font-semibold [&_b]:font-semibold [&_em]:italic [&_i]:italic',
    '[&_blockquote]:border-l-2 [&_blockquote]:border-[rgb(var(--color-text))]/20 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4',
  ].join(' '),
  placeholderText: '[font-family:var(--font-body)] text-[16px] text-[rgb(var(--color-muted))]',
} as const;
