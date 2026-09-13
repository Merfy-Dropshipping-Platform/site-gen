export const CheckoutSubmitTokens = [
  // Пара кнопки: её читают классы блока (CheckoutSubmit.classes.ts) и в неё же
  // инлайн-скрипт кладёт результат расчёта контраста — список обязан их знать.
  '--color-button-bg',
  '--color-button-text',
  '--color-button-bg-hover',
  '--color-button-text-hover',
  '--color-accent',
  '--color-accent-fg',
  '--color-accent-2',
  '--font-body',
  '--size-body',
  '--radius-button',
] as const satisfies readonly `--${string}`[];
