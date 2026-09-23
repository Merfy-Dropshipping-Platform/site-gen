export const CartTotalsClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'max-w-[768px] mx-auto px-4 sm:px-6 flex justify-end',
  inner: 'flex items-center gap-[15px]',
  label: '[font-family:var(--font-body)] text-[20px] leading-[27px] text-[rgb(var(--color-heading))]',
  value: '[font-family:var(--font-body)] text-[20px] leading-[27px] text-[rgb(var(--color-heading))]',
  // PR-19 — точка расширений (модуль расширения магазина): пусто, пока
  // включённых расширений нет — `empty:hidden` убирает контейнер из потока
  // целиком (без даже пустого отступа под ним).
  extPoint: 'max-w-[768px] mx-auto px-4 sm:px-6 empty:hidden',
} as const;
