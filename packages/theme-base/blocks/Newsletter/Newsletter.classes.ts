export const NewsletterClasses = {
  root: 'relative w-full',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4 text-center',
  inner: 'mx-auto max-w-[var(--size-newsletter-form-w)]',
  heading:
    'font-[var(--font-heading)] text-[var(--size-hero-heading)] text-[rgb(var(--color-heading))] mb-4',
  description: 'font-[var(--font-body)] text-[rgb(var(--color-text))] mb-6 opacity-80',
  form: 'flex gap-2',
  input:
    'flex-1 h-[var(--size-hero-button-h)] px-4 rounded-[var(--radius-input)] border border-[rgb(var(--color-button-border))] bg-white font-[var(--font-body)]',
  button:
    'inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-6 bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] border border-[rgb(var(--color-button-border))] font-[var(--font-body)]',
} as const;
