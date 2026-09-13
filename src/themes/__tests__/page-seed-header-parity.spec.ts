import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { unifyHeaderWithHome } from '../../utils/revision-migrations';

/**
 * Пункт 13 — источник расхождения №1: сиды страниц тем.
 *
 * Блок «Шапка» лежит копией в КАЖДОМ файле `packages/theme-<t>/pages/<id>.json`.
 * Пока копии живут своей жизнью, новый сайт стартует с разными шапками на
 * разных страницах (замер 2026-09-13: rose каталог/коллекция/товар несли
 * `siteTitle/logo/logoPosition/actionButtons`, которых нет на главной; flux —
 * лишний `menuColorScheme` на семи страницах; bloom — недоставало пяти
 * параметров; vanilla — почти везде пустая шапка `{id}`).
 *
 * Инвариант: шапка любой страницы темы совпадает с шапкой её `home.json`
 * ЦЕЛИКОМ, кроме собственного `id`. Исключение — `CheckoutHeader`: это другой
 * компонент (минимальная шапка чекаута, Figma 1:13563) со своим набором полей.
 */
const THEMES = ['rose', 'vanilla', 'flux', 'satin', 'bloom'] as const;
const PKG = (t: string) => join(__dirname, '..', '..', '..', 'packages', `theme-${t}`, 'pages');

type Block = { type?: string; props?: Record<string, unknown> };

function seedHeader(theme: string, file: string): Block | null {
  const p = join(PKG(theme), file);
  if (!existsSync(p)) return null;
  const content = (JSON.parse(readFileSync(p, 'utf8')).content ?? []) as Block[];
  return content.find((b) => b?.type === 'Header' || b?.type === 'CheckoutHeader') ?? null;
}

function withoutId(props: Record<string, unknown> = {}) {
  const { id: _id, ...rest } = props;
  return rest;
}

describe('сиды страниц тем: шапка = шапка главной', () => {
  for (const theme of THEMES) {
    const dir = PKG(theme);
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];

    it(`${theme}: у главной есть шапка (эталон существует)`, () => {
      const home = seedHeader(theme, 'home.json');
      expect(home?.type).toBe('Header');
    });

    for (const file of files) {
      if (file === 'home.json') continue;
      it(`${theme}/${file}: шапка совпадает с главной`, () => {
        const home = seedHeader(theme, 'home.json')!;
        const block = seedHeader(theme, file);
        if (!block) return; // страницы без шапки — отдельный вопрос, не этот тест
        if (block.type === 'CheckoutHeader') return; // другой компонент by design
        expect(withoutId(block.props)).toEqual(withoutId(home.props));
      });
    }
  }

  it('САБОТАЖ: подложенная лишняя настройка ловится проверкой', () => {
    const home = seedHeader('rose', 'home.json')!;
    const sabotaged: Block = {
      type: 'Header',
      props: { ...home.props, id: 'Header-x', menuColorScheme: 'scheme-9' },
    };
    expect(withoutId(sabotaged.props)).not.toEqual(withoutId(home.props));
  });

  it('САБОТАЖ: миграция стирает лишнюю настройку страницы', () => {
    const home = seedHeader('rose', 'home.json')!;
    const out = unifyHeaderWithHome({
      home: { content: [home] },
      'page-x': {
        content: [
          { type: 'Header', props: { ...home.props, id: 'Header-x', menuColorScheme: 'scheme-9' } },
        ],
      },
    }) as Record<string, { content: Block[] }>;
    expect(out['page-x'].content[0].props).not.toHaveProperty('menuColorScheme');
  });
});
