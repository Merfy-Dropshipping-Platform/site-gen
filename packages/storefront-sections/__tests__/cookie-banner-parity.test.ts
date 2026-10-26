import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sectionFieldShape } from '../src/fields';

// Поля баннера cookie — как на проде у пяти тем (эталон rose, экран banner-group): у «Заголовка» и «Текста» — поле
// с ИИ (title и description, тулбар ИИ и форматирование), кнопки — группа «Кнопки» с полями «Основная» и
// «Дополнительная» (CookieBannerPanel прода).
const manifest = z
  .object({ settings: z.array(sectionFieldShape) })
  .parse(JSON.parse(readFileSync(new URL('../fixtures/shop/cookie-banner/section.json', import.meta.url), 'utf8')));

describe('поля баннера cookie — как на проде', () => {
  it('у «Заголовка» и «Текста» — поле с ИИ: title и описание', () => {
    const heading = manifest.settings.find((field) => field.id === 'heading');
    const text = manifest.settings.find((field) => field.id === 'text');
    expect(heading?.setting).toMatchObject({ kind: 'string', ai: 'title' });
    expect(text?.setting).toMatchObject({ kind: 'text', ai: 'description' });
  });

  it('кнопки — группа «Кнопки»: «Основная» и «Дополнительная», без подсказок в полях', () => {
    const primary = manifest.settings.find((field) => field.id === 'button-label');
    const secondary = manifest.settings.find((field) => field.id === 'label');
    expect(primary).toMatchObject({ label: 'Основная', section: 'Кнопки' });
    expect(secondary).toMatchObject({ label: 'Дополнительная', section: 'Кнопки' });
    for (const field of [primary, secondary]) expect(field?.sublabel).toBeUndefined();
  });

  it('порядок полей — как на проде: Заголовок, Текст, Кнопки, Расположение', () => {
    expect(manifest.settings.map((field) => field.id)).toEqual([
      'heading',
      'text',
      'button-label',
      'label',
      'content-position',
    ]);
  });
});
