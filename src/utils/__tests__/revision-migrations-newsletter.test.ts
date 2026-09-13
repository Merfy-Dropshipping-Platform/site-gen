import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrateRevisionData } from '../revision-migrations';

/**
 * Пункт 6 пачки тестировщика (13.09): «В секции Подписка на рассылку текст в
 * инпуте изменить на просто "Email"».
 *
 * Замер «до»:
 *   • дефолт блока — packages/theme-base/blocks/Newsletter/Newsletter.puckConfig.ts
 *     → `defaults.placeholder = 'Твой email'` (в theme.json пяти тем
 *     переопределения placeholder НЕТ, проверено по blockDefaults.Newsletter);
 *   • у уже созданных магазинов строка лежит В РЕВИЗИИ (панель материализует
 *     дефолты в props при любой правке соседнего поля), поэтому одной смены
 *     дефолта мало — иначе владелец на своём сайте увидит прежнее «Твой email».
 *
 * Здесь сторожим обе половины: дефолт блока и разовый перенос существующих
 * ревизий. Переносится ТОЛЬКО платформенная строка — текст, который мерчант
 * вписал сам, не трогается.
 */
const ROOT = join(__dirname, '..', '..', '..');
const NEWSLETTER_PUCK_CONFIG = join(
  ROOT,
  'packages',
  'theme-base',
  'blocks',
  'Newsletter',
  'Newsletter.puckConfig.ts',
);

/** `defaults: { … }` блока Newsletter из исходника puckConfig. */
function newsletterDefaults(): string {
  const src = readFileSync(NEWSLETTER_PUCK_CONFIG, 'utf-8');
  const at = src.indexOf('defaults:');
  expect(at).toBeGreaterThan(-1);
  return src.slice(at, at + 600);
}

const newsletter = (props: Record<string, unknown>) => ({
  type: 'Newsletter',
  props: { id: 'Newsletter-1', ...props },
});

const homeWith = (blocks: unknown[]) => ({ pagesData: { home: { content: blocks } } });

const firstNewsletter = (result: unknown): Record<string, unknown> => {
  const pages = (result as { pagesData: Record<string, { content: Array<Record<string, any>> }> })
    .pagesData;
  const block = pages['home'].content.find((b) => b.type === 'Newsletter');
  expect(block).toBeTruthy();
  return block!.props as Record<string, unknown>;
};

describe('Newsletter: подсказка в поле ввода', () => {
  it('дефолт блока — «Email», а не «Твой email»', () => {
    const defaults = newsletterDefaults();
    expect(defaults).toContain("placeholder: 'Email'");
    expect(defaults).not.toContain('Твой email');
  });

  it('в уже сохранённой ревизии «Твой email» переезжает в «Email»', () => {
    const result = migrateRevisionData(
      homeWith([newsletter({ placeholder: 'Твой email', buttonText: 'Подписаться' })]),
    );
    expect(firstNewsletter(result).placeholder).toBe('Email');
  });

  it('текст мерчанта не трогаем', () => {
    const result = migrateRevisionData(
      homeWith([newsletter({ placeholder: 'Ваша почта для скидок' })]),
    );
    expect(firstNewsletter(result).placeholder).toBe('Ваша почта для скидок');
  });

  it('старая форма props.form.placeholder мигрирует так же', () => {
    const result = migrateRevisionData(
      homeWith([newsletter({ form: { placeholder: 'Твой email', buttonText: 'ОК' } })]),
    );
    const form = firstNewsletter(result).form as { placeholder: string; buttonText: string };
    expect(form.placeholder).toBe('Email');
    expect(form.buttonText).toBe('ОК');
  });

  it('идемпотентна: второй прогон ничего не меняет', () => {
    const once = migrateRevisionData(homeWith([newsletter({ placeholder: 'Твой email' })]));
    const twice = migrateRevisionData(once);
    expect(firstNewsletter(twice).placeholder).toBe('Email');
  });

  it('другие секции не задевает', () => {
    const result = migrateRevisionData(
      homeWith([
        { type: 'ContactForm', props: { id: 'ContactForm-1', placeholder: 'Твой email' } },
      ]),
    );
    const pages = (result as { pagesData: Record<string, { content: Array<Record<string, any>> }> })
      .pagesData;
    const block = pages['home'].content.find((b) => b.type === 'ContactForm');
    expect(block!.props.placeholder).toBe('Твой email');
  });
});
