import { describe, expect, it } from 'vitest';
import { sectionAnswer } from '../src/answer';
import type { SectionManifest } from '../src/format';
import type { PrepareResult } from '../src/prepare';
import { problem } from '../src/problems';

// Ответ проверки для ИИ (блок 14, 14.6): один JSON у команды и у адресов шлюза.
// Отклонение от плана (разрешено основным тредом): явный тип MANIFEST — без него sdk выводится как number,
// и литерал теста не проходит typecheck против SectionManifest (sdk: 1).
const MANIFEST: SectionManifest = { sdk: 1, name: 'reviews', kind: 'section', title: 'Отзывы', settings: [] };
const FILES = { 'section.json': JSON.stringify(MANIFEST), 'template.astro': '<div></div>' };
const UNKNOWN = problem(
  'setting-name-unknown',
  'section.json',
  'поле «title»: имени нет в словаре; ближе всего — heading',
  {
    line: 9,
    column: 13,
  },
);
const HEAVY = problem('script-heavy', 'script.ts', 'скрипт 12 КБ после сжатия, предупреждение — от 10 КБ');

describe('sectionAnswer', () => {
  it('отказ: отказы и предупреждения порознь, у каждого doc; имя — из section.json', () => {
    const result: PrepareResult = { ok: false, problems: [HEAVY, UNKNOWN] };
    expect(sectionAnswer('shop', FILES, result)).toEqual({
      ok: false,
      name: 'shop:reviews',
      problems: [{ ...UNKNOWN, doc: 'errors.md#setting-name-unknown' }],
      warnings: [{ ...HEAVY, doc: 'errors.md#script-heavy' }],
    });
  });

  it('section.json не разобран — имени нет', () => {
    const broken = problem('manifest-invalid', 'section.json', 'не JSON: Unexpected token');
    const answer = sectionAnswer('shop', { 'section.json': '{' }, { ok: false, problems: [broken] });
    expect(answer).toMatchObject({ ok: false, name: null, warnings: [] });
    expect(answer.problems.map((item) => item.doc)).toEqual(['errors.md#manifest-invalid']);
  });

  it('прошла: имя секции, отказов нет, предупреждения — из секции', () => {
    const result: PrepareResult = {
      ok: true,
      section: {
        name: 'shop:reviews',
        manifest: { ...MANIFEST, kind: 'section', settings: [] },
        template: '<div></div>',
        render: 'export default 1;',
        script: null,
        warnings: [HEAVY],
      },
    };
    expect(sectionAnswer('shop', FILES, result)).toEqual({
      ok: true,
      name: 'shop:reviews',
      problems: [],
      warnings: [{ ...HEAVY, doc: 'errors.md#script-heavy' }],
    });
  });
});
