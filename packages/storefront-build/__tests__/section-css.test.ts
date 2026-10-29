import { platformDictionary } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import { htmlClasses, sectionCss } from '../src/section-css';

const dictionary = platformDictionary;

describe('CSS секций', () => {
  it('классы из разметки — без повторов, по алфавиту', () => {
    expect(htmlClasses('<div class="flex  items-center"><p class="m-0 flex"></p><i class=""></i></div>')).toEqual([
      'flex',
      'items-center',
      'm-0',
    ]);
  });

  it('CSS только для классов разметки, без слоя base', async () => {
    const css = await sectionCss('<div class="flex items-center"></div>', dictionary);
    expect(css).toContain('.flex');
    expect(css).toContain('.items-center');
    expect(css).not.toContain('.grid');
    expect(css).not.toMatch(/@layer base\s*\{/);
  });

  // «Ширина» секции (базовые секции, 29.10): обёртка задаёт --width-page, max-w-page внутри берёт её — фон обёртки во
  // всю ширину, содержимое уже.
  it('ширина секции: свойство обёртки --width-page и max-w-page содержимого', async () => {
    const css = await sectionCss(
      '<merfy-section class="[--width-page:768px]"><div class="max-w-page"></div></merfy-section>',
      dictionary,
    );
    expect(css).toMatch(/--width-page:\s*768px/);
    expect(css).toMatch(/max-width:\s*var\(--width-page\)/);
  });

  it('классов нет — пустая строка', async () => {
    expect(await sectionCss('<p>текст</p>', dictionary)).toBe('');
  });
});
