import { describe, expect, it } from 'vitest';
import { checkTemplate } from '../src/compile';

// Проверка шаблона вызывает проверку поведений вместе с запретами и компиляцией (блок 6, часть 6б).
const FRONT = '---\nconst { settings } = Astro.props;\n---\n';

describe('checkTemplate и поведения', () => {
  it('поведение с верной разметкой — модуль рендера есть; с опечаткой — отказ без модуля и с кодом', async () => {
    const good = await checkTemplate(
      `${FRONT}<div data-behavior="accordion"><details><summary>q</summary><div data-part="content">a</div></details></div>`,
    );
    expect(good.problems).toEqual([]);
    expect(good.render).not.toBeNull();
    const bad = await checkTemplate(`${FRONT}<div data-behavior="acordion"></div>`);
    expect(bad.problems.map((item) => item.code)).toEqual(['behavior-unknown']);
    expect(bad.render).toBeNull();
  });
});
