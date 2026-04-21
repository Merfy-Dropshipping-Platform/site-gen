export const AuthModalClasses = {
  root: 'relative max-w-[420px] w-full mx-auto bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] p-8 rounded-[var(--radius-input)]',
  closeBtn: 'absolute top-3 right-3 p-2 text-[rgb(var(--color-text))] bg-transparent border-0 cursor-pointer',
  heading: '[font-family:var(--font-heading)] text-[length:var(--size-hero-heading)] text-[rgb(var(--color-heading))] mb-4',
  loginForm: 'flex flex-col gap-3',
  registerForm: 'flex flex-col gap-3',
  otpForm: 'flex flex-col gap-3',
  field: 'flex flex-col gap-1 [font-family:var(--font-body)] text-[rgb(var(--color-text))]',
  input: 'px-3 py-2 rounded-[var(--radius-input)] border border-[rgb(var(--color-button-border))] bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  submitBtn: 'h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] border border-[rgb(var(--color-button-border))] [font-family:var(--font-body)]',
  socialLogin: 'mt-3 flex flex-col gap-2',
  error: 'text-[rgb(var(--color-error))] [font-family:var(--font-body)] text-sm',
  switchLink: 'mt-2 text-[rgb(var(--color-text))] underline text-sm',
} as const;
