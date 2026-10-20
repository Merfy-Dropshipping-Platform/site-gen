import { describe, expect, it } from 'vitest';
import { settingFieldShape, settingProblem, tailwindCss } from '../src';
import { platformDictionary } from '../src/dictionary';

// CSS секции (блок 1 «Секций и SDK») собирается без слоя base: сброс уже есть на странице темы.
describe('tailwindCss без слоя base', () => {
  it('по умолчанию слой base в конце, с { base: false } его нет', () => {
    const dictionary = platformDictionary;
    const full = tailwindCss(dictionary);
    const bare = tailwindCss(dictionary, { base: false });
    expect(full.startsWith(bare.slice(0, -1))).toBe(true);
    expect(full.length).toBeGreaterThan(bare.length);
    expect(tailwindCss(dictionary, { base: true })).toBe(full);
  });
});

describe('поле настройки секции', () => {
  it('settingFieldShape пропускает поле выбора и не пропускает лишний ключ', () => {
    const field = {
      id: 'heading-size',
      label: 'Размер заголовка',
      section: 'Оформление',
      setting: {
        kind: 'select',
        default: 'large',
        options: [
          { value: 'medium', label: 'Средний' },
          { value: 'large', label: 'Крупный' },
        ],
      },
    };
    expect(settingFieldShape.safeParse(field).success).toBe(true);
    expect(settingFieldShape.safeParse({ ...field, extra: 1 }).success).toBe(false);
  });

  it('settingProblem: значение не из вариантов — текст с путём', () => {
    const spec = {
      kind: 'select' as const,
      default: 'large',
      options: [
        { value: 'medium', label: 'Средний' },
        { value: 'large', label: 'Крупный' },
      ],
    };
    expect(settingProblem('heading-size', spec, 'large')).toBeUndefined();
    expect(settingProblem('heading-size', spec, 'huge')).toMatch(/^heading-size: нужно /);
  });
});
