// ContactForm — pixel-matched to Figma Rose 669:18123. Two-column wide
// layout: left column stacks Имя/E-mail/Телефон inputs, right column is a
// tall textarea "Ваш вопрос". "Отправить" button sits below the right
// column, aligned to the right edge. Heading uses the same 14px uppercase
// tracked style as other Rose section titles.
export const ContactFormClasses = {
  root:
    'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container:
    'mx-auto max-w-[var(--container-max-width)] px-4',
  inner:
    'mx-auto max-w-[1200px]',
  heading:
    '[font-family:var(--font-heading)] text-[14px] leading-[16px] tracking-[0.1em] uppercase text-[rgb(var(--color-heading))] mb-8',
  description:
    '[font-family:var(--font-body)] text-[12px] leading-[15px] text-[rgb(var(--color-text))]/60 mb-8',
  form:
    'grid grid-cols-1 lg:grid-cols-[429px_1fr] gap-4',
  leftColumn:
    'flex flex-col gap-4',
  rightColumn:
    'flex flex-col gap-4',
  field:
    'flex flex-col gap-2',
  label:
    '[font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-text))]',
  required:
    'text-[rgb(var(--color-error))] ml-1',
  input:
    'w-full h-14 px-4 rounded-[var(--radius-input)] border border-[rgb(var(--color-text))]/20 bg-transparent [font-family:var(--font-body)] text-[16px] text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-text))]/40 focus:border-[rgb(var(--color-heading))] focus:outline-none transition-colors',
  textarea:
    'w-full h-full min-h-[196px] px-4 py-3 rounded-[var(--radius-field,var(--radius-input))] border border-[rgb(var(--color-text))]/20 bg-transparent [font-family:var(--font-body)] text-[16px] text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-text))]/40 focus:border-[rgb(var(--color-heading))] focus:outline-none resize-y transition-colors',
  buttonRow:
    'flex justify-end mt-2',
  button:
    'inline-flex items-center justify-center h-12 px-6 rounded-[var(--radius-button)] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] border border-[rgb(var(--color-button-border))] [font-family:var(--font-body)] text-[14px] leading-[17px] hover:opacity-90 transition-opacity',
} as const;
