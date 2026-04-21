export const ContactFormClasses = {
  root: 'relative w-full',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  inner: 'mx-auto max-w-2xl',
  heading:
    'font-[var(--font-heading)] text-[var(--size-hero-heading)] text-[rgb(var(--color-heading))] mb-4 text-center',
  description:
    'font-[var(--font-body)] text-[rgb(var(--color-text))] mb-8 text-center opacity-80',
  form: 'flex flex-col gap-4',
  field: 'flex flex-col gap-2',
  label:
    'font-[var(--font-body)] text-sm text-[rgb(var(--color-heading))]',
  required: 'text-[rgb(var(--color-error))] ml-1',
  input:
    'w-full h-[var(--size-hero-button-h)] px-4 rounded-[var(--radius-input)] border border-[rgb(var(--color-button-border))] bg-white font-[var(--font-body)]',
  textarea:
    'w-full min-h-[140px] px-4 py-3 rounded-[var(--radius-field)] border border-[rgb(var(--color-button-border))] bg-white font-[var(--font-body)]',
  button:
    'inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-6 bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] border border-[rgb(var(--color-button-border))] font-[var(--font-body)] mt-2 self-center',
} as const;
