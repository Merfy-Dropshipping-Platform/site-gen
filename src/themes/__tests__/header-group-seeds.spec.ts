/**
 * Сиды страниц: группа «Шапка» одна на всю тему.
 *
 * Третий круг тестировщика, п.2: «на всех страницах блок Шапка отличается, как
 * набором секций». Дрейф родился в сидах: у rose промо-баннер лежал на 5
 * страницах из 11 (home/about/cart/contacts/delivery), у flux и bloom — только
 * на главной. Читающий путь это теперь выравнивает (`unifyHeaderWithHome`), но
 * если сиды снова разойдутся, новый сайт опять стартует с расхождения — а
 * мерчант увидит в левой колонке то две строки, то одну, пока не сохранит.
 *
 * Проверяем ровно инвариант: у любой страницы с обычной шапкой набор блоков
 * группы «Шапка» совпадает с главной. Страницы чекаута (`CheckoutHeader`) —
 * другой компонент by design, они исключены.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PKGS = resolve(__dirname, '..', '..', '..', 'packages');
const THEMES = ['rose', 'bloom', 'satin', 'flux', 'vanilla'] as const;
const GROUP = ['PromoBanner', 'Header'];

type Block = { type?: string; props?: Record<string, unknown> };

const readSeed = (theme: string, file: string): Block[] => {
  const raw = readFileSync(resolve(PKGS, `theme-${theme}`, 'pages', file), 'utf-8');
  const data = JSON.parse(raw) as { content?: Block[] };
  return Array.isArray(data.content) ? data.content : [];
};

const groupOf = (content: Block[]) =>
  content.filter((b) => GROUP.includes(String(b.type))).map((b) => String(b.type));

describe.each(THEMES)('сиды: группа «Шапка» = группа главной — %s', (theme) => {
  const homeGroup = groupOf(readSeed(theme, 'home.json'));
  const files = readdirSync(resolve(PKGS, `theme-${theme}`, 'pages')).filter(
    (f) => f.endsWith('.json') && f !== 'home.json',
  );

  it('главная вообще содержит шапку', () => {
    expect(homeGroup).toContain('Header');
  });

  it.each(files)('%s', (file) => {
    const content = readSeed(theme, file);
    if (!content.some((b) => b.type === 'Header')) return; // чекаут — свой хром
    expect(groupOf(content)).toEqual(homeGroup);
  });

  it('id блоков группы уникальны внутри страницы', () => {
    for (const file of files) {
      const content = readSeed(theme, file);
      const ids = content
        .filter((b) => GROUP.includes(String(b.type)))
        .map((b) => String(b.props?.id ?? ''));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
