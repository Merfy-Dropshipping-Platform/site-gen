export const LoginSectionClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container:
    'mx-auto flex max-w-[var(--container-max-width)] flex-col items-center px-4',
  heading:
    '[font-family:var(--font-heading)] text-[length:var(--size-hero-heading)] text-[rgb(var(--color-heading))] text-center',
  text: '[font-family:var(--font-body)] text-center text-[rgb(var(--color-text))] opacity-70 mt-2',
  form: 'mt-8 flex w-full max-w-96 flex-col gap-6',
} as const;
