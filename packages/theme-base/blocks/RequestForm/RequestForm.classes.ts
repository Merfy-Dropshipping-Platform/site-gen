// RequestForm — классы обёртки каркаса «Формы заявки» (спека 118, T013a).
// Только тема: Tailwind-строки через rgb(var(--color-*)) / var(--font-*),
// без хексов и сырых rgb(). Сами поля формы рисует sf-разметка мокапа
// (классы sf-*, стили — RequestForm.sf-styles.ts, изолированы .rq-sf).
export const RequestFormClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  inner: 'mx-auto max-w-[560px]',
  heading:
    '[font-family:var(--font-heading)] text-[14px] leading-[16px] tracking-[0.1em] uppercase text-[rgb(var(--color-heading))] mb-2',
  note: '[font-family:var(--font-body)] text-[12px] leading-[15px] text-[rgb(var(--color-muted))] mb-4',
  // Пустой контейнер [data-request-form]: до T013b лишь показывает границы
  // будущей формы (sf-box из порта мокапа), T013b наполнит его через
  // renderFormHTML() из runtime/requests-form.ts.
  formShell: 'rq-sf',
} as const;
