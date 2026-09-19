/**
 * Секция «Мультиряды» без своей «Высоты» не должна поехать после того, как
 * «Высота» ожила.
 *
 * Откуда задача. 19.09 порты тем получили правило `perRowSizesDiffer`, и
 * секционная «Высота» начала править высотой рядов. Фолбэк порта пришлось
 * свести с дефолтом панели — иначе рендер «с дефолтом» расходится с рендером
 * «без значения» (`panel-default-is-noop`). Но `adaptLegacyProps` секционный
 * `size` НЕ подставляет, и в живых ревизиях есть секции вовсе без него: до
 * 19.09 отсутствие читалось как СРЕДНИЙ аспект, а со сведённым фолбэком стало
 * бы 'small' — ряды таких секций стали бы ниже.
 *
 * Что сторожим:
 *  1. миграция проставляет отсутствующей «Высоте» 'medium' — прежний молчаливый
 *     фолбэк, теперь явным значением;
 *  2. заданную «Высоту» миграция не трогает (иначе затрёт выбор мерчанта);
 *  3. 'medium' действительно эквивалентен отсутствию во ВСЕХ пяти портах —
 *     если чей-то `aspectFor` переедет на другую ветку, миграция начнёт менять
 *     вид молча, и поймать это иначе нечем.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { migrateRevisionData } from '../../utils/revision-migrations';

const ROOT = resolve(__dirname, '../../..');
const THEMES = ['rose', 'bloom', 'satin', 'flux', 'vanilla'] as const;
const portOf = (theme: string) => `themes/${theme}/src/components/sections/MultiRows.astro`;

const revisionWith = (props: Record<string, unknown>) => ({
  pages: [{ id: 'home', name: 'Главная' }],
  pagesData: {
    home: {
      content: [{ type: 'MultiRows', props: { id: 'MultiRows-1', rows: [{ title: 'A' }], ...props } }],
      root: {},
    },
  },
  currentPageId: 'home',
});

const sectionSizeAfter = (props: Record<string, unknown>) => {
  const out = migrateRevisionData(revisionWith(props) as never) as {
    pagesData: { home: { content: { props: { size?: unknown } }[] } };
  };
  return out.pagesData.home.content[0].props.size;
};

describe('«Мультиряды»: секция без «Высоты» сохраняет прежний вид', () => {
  it('отсутствие размера материализуется в medium', () => {
    expect(sectionSizeAfter({})).toBe('medium');
  });

  it('выбор мерчанта не затирается', () => {
    expect(sectionSizeAfter({ size: 'small' })).toBe('small');
    expect(sectionSizeAfter({ size: 'large' })).toBe('large');
    expect(sectionSizeAfter({ size: 'medium' })).toBe('medium');
  });

  it.each(THEMES)('%s: medium и отсутствие дают один и тот же аспект', (theme) => {
    const src = readFileSync(resolve(ROOT, portOf(theme)), 'utf8');
    const decl = src.slice(src.indexOf('const aspectFor'));
    const body = decl.slice(0, decl.indexOf(';'));

    // Лестница вида: small → …, large → …, всё остальное → фолбэк. 'medium'
    // обязан падать в тот же фолбэк, что и undefined, — то есть в ветку без
    // собственного условия. Если у темы появится ветка `s === "medium"`,
    // эквивалентность сломается и миграция начнёт менять вид.
    expect(body).toMatch(/s === "small"/);
    expect(body).toMatch(/s === "large"/);
    expect(body).not.toMatch(/s === "medium"/);
  });
});
