import type { SettingField } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import { defaultSettings, resolveSectionSettings, settingsTexts } from '../src/settings';

const SIZE_OPTIONS = [
  { value: 'medium', label: 'Средний' },
  { value: 'large', label: 'Крупный' },
];
const HEADING: SettingField = {
  id: 'heading',
  label: 'Заголовок',
  setting: { kind: 'string', default: 'Тёплые шарфы из кашемира' },
};
const SIZE: SettingField = {
  id: 'heading-size',
  label: 'Размер заголовка',
  section: 'Оформление',
  setting: { kind: 'select', default: 'large', options: SIZE_OPTIONS },
};
// Путь проблемы — до первого двоеточия: «settings.3.default: нужно …» → «settings.3.default».
const pathsOf = (texts: readonly string[]): string[] => texts.map((text) => text.slice(0, text.indexOf(':')));

describe('поля настроек секции', () => {
  it('верные поля — проблем нет', () => {
    expect(settingsTexts([HEADING, SIZE])).toEqual([]);
  });

  it('id не по словарю, повтор id, неверное умолчание, условие на несуществующую настройку', () => {
    const texts = settingsTexts([
      { ...HEADING, id: 'Heading' },
      HEADING,
      HEADING,
      { id: 'heading-size', label: 'Размер', setting: { kind: 'select', default: 'huge', options: SIZE_OPTIONS } },
      { ...HEADING, id: 'text', visibleWhen: { setting: 'align', equals: 'left' } },
    ]);
    expect(pathsOf(texts)).toEqual(['settings.0.id', 'settings.2.id', 'settings.3.default', 'settings.4.visibleWhen']);
  });

  it('условие показа: значение — из вариантов той настройки', () => {
    const texts = settingsTexts([SIZE, { ...HEADING, visibleWhen: { setting: 'heading-size', equals: 'huge' } }]);
    expect(pathsOf(texts)).toEqual(['settings.1.visibleWhen.equals']);
  });
});

describe('значения экземпляра секции', () => {
  it('умолчания всех полей', () => {
    expect(defaultSettings([HEADING, SIZE])).toEqual({ heading: 'Тёплые шарфы из кашемира', 'heading-size': 'large' });
  });

  it('правка поверх умолчания; неизвестный ключ и неверное значение — в invalid, значение — умолчание', () => {
    const resolved = resolveSectionSettings([HEADING, SIZE], {
      heading: 'Шарфы к первым холодам',
      'heading-size': 'huge',
      color: 'red',
    });
    expect(resolved.values).toEqual({ heading: 'Шарфы к первым холодам', 'heading-size': 'large' });
    expect(pathsOf(resolved.invalid)).toEqual(['color', 'heading-size']);
  });

  it('значение не строка и не true/false — в invalid', () => {
    expect(pathsOf(resolveSectionSettings([HEADING], { heading: 5 }).invalid)).toEqual(['heading']);
  });
});
