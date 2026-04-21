export const CheckoutSectionClasses = {
  root: 'relative w-full',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    '[font-family:var(--font-heading)] text-[var(--size-hero-heading)] text-[rgb(var(--color-heading))] mb-8',
  form: 'flex flex-col gap-6',
  fieldset:
    'flex flex-col gap-3 rounded-[var(--radius-field)] border border-[rgb(var(--color-button-border))] bg-white p-6',
  legend:
    '[font-family:var(--font-heading)] text-base text-[rgb(var(--color-heading))] px-2',
  totals:
    'mt-4 p-6 rounded-[var(--radius-field)] bg-white border border-[rgb(var(--color-button-border))] [font-family:var(--font-body)] text-[rgb(var(--color-text))]',
  submit:
    'inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-6 bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] border border-[rgb(var(--color-button-border))] [font-family:var(--font-body)] mt-2 self-center disabled:opacity-60 disabled:cursor-not-allowed',
} as const;
