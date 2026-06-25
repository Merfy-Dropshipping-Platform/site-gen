import {
  NewsletterSchema,
  NewsletterPuckConfig,
  NewsletterClasses,
} from '../index';

/**
 * 084 vanilla pilot — additive variant: Newsletter.formLayout.
 *   - 'stacked'        : button below input (block layout)
 *   - 'inline-submit'  : pre-084 default (button absolute over input)
 * Default is unset → identical pre-commit (inline-submit appearance).
 */
describe('Newsletter.formLayout (additive variant)', () => {
  const baseValid = {
    placeholder: 'email',
    buttonText: 'go',
    padding: { top: 0, bottom: 0 },
  };

  it('schema accepts formLayout="stacked"', () => {
    expect(
      NewsletterSchema.safeParse({ ...baseValid, formLayout: 'stacked' }).success,
    ).toBe(true);
  });

  it('schema accepts formLayout="inline-submit"', () => {
    expect(
      NewsletterSchema.safeParse({ ...baseValid, formLayout: 'inline-submit' }).success,
    ).toBe(true);
  });

  it('schema rejects invalid formLayout', () => {
    expect(
      NewsletterSchema.safeParse({
        ...baseValid,
        formLayout: 'card' as unknown as 'stacked',
      }).success,
    ).toBe(false);
  });

  it('schema works without formLayout (backwards compat)', () => {
    expect(NewsletterSchema.safeParse(baseValid).success).toBe(true);
  });

  // Поле «Форма» убрано из UI-панели по требованию («не наше»). Проп formLayout
  // остаётся в schema/defaults/рендере (vanilla inline-submit через blockDefaults)
  // и в fields как hidden (тип fields = Record<keyof Props> требует запись), но
  // UI-выбора больше нет — поэтому field.type должен быть 'hidden'.
  it('formLayout field скрыт из UI (hidden)', () => {
    const fields = NewsletterPuckConfig.fields as Record<string, { type?: string }>;
    expect(fields.formLayout?.type).toBe('hidden');
  });

  it('Classes export formWrapper mapping with both variants', () => {
    const c = NewsletterClasses as Record<string, unknown>;
    expect(c.formWrapper).toBeDefined();
    const map = c.formWrapper as Record<string, string>;
    expect(map.stacked).toBeDefined();
    expect(map['inline-submit']).toMatch(/relative/);
  });
});
