export const LoginSectionClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container:
    'mx-auto flex max-w-[var(--container-max-width)] flex-col items-center px-4',
  heading:
    '[font-family:var(--font-heading)] text-[length:var(--size-hero-heading)] text-[rgb(var(--color-heading))] text-center',
  text: '[font-family:var(--font-body)] text-center text-[rgb(var(--color-text))] opacity-70 mt-2',
  // Дословно копия solid-варианта ImageWithText.classes.ts (button) — пятый
  // параметр «Кнопка», репорт тестера 15.09 [5].
  button:
    'inline-flex items-center justify-center h-[48px] px-4 mt-4 text-[16px] font-normal uppercase no-underline transition-colors [font-family:var(--font-body)] border-[1.3px] border-solid border-[rgb(var(--color-button-border))] rounded-[var(--radius-button)] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] hover:bg-[rgb(var(--color-button-bg-hover))] hover:text-[rgb(var(--color-button-text-hover))]',
  form: 'mt-8 flex w-full max-w-96 flex-col gap-6',
} as const;
