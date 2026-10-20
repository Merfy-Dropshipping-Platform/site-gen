import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASTRO_RUNTIME, checkTemplate, compileTemplate, moduleImportProblems } from '../src/compile';

const HERO = readFileSync(new URL('../fixtures/sections/hero/template.astro', import.meta.url), 'utf8');

describe('компиляция шаблона', () => {
  it('модуль «Первого экрана» импортирует только рантайм Astro', async () => {
    const compiled = await compileTemplate(HERO);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.problems));
    expect(compiled.code).toContain(ASTRO_RUNTIME);
    expect(await moduleImportProblems(compiled.code)).toEqual([]);
  });

  it('синтаксическая ошибка — template-compile с местом', async () => {
    const compiled = await compileTemplate('<div>\n  {settings.heading\n</div>');
    expect(compiled.ok).toBe(false);
    const problems = compiled.ok ? [] : compiled.problems;
    expect([...new Set(problems.map((item) => item.code))]).toEqual(['template-compile']);
    expect(problems[0]?.line).toBeGreaterThan(0);
  });

  it('чужой и динамический импорт — import-forbidden', async () => {
    const code = `import fs from 'node:fs';\nimport { render } from '${ASTRO_RUNTIME}';\nconst late = import('${ASTRO_RUNTIME}');`;
    expect((await moduleImportProblems(code)).map((item) => item.code)).toEqual(['import-forbidden', 'import-forbidden']);
  });

  it('checkTemplate: верный шаблон — модуль рендера; запрет — модуля нет', async () => {
    const good = await checkTemplate(HERO);
    expect(good.problems).toEqual([]);
    expect(good.render).toContain(ASTRO_RUNTIME);
    const bad = await checkTemplate('<div onclick="x"></div>');
    expect(bad.problems.map((item) => item.code)).toEqual(['template-forbidden']);
    expect(bad.render).toBeNull();
  });
});
