import { describe, expect, it } from 'vitest';
import type { BuildInputs, CodeSection } from '../src/inputs';
import { renderShopPage, type ShopTheme } from '../src/page';
import { type PageRender, type SectionRenderRequest } from '../src/sections-render';
import { ASSETS, GEO, RENDERS, codeInputs } from './support-code';
import { fakeRender, novaTokens } from './support-theme';

// Классы глобального скрипта (kind: global) в CSS страницы: скрипт грузится на каждой странице магазина и ставит классы
// скрытому элементу уже в браузере (el.toggleClass), поэтому их CSS — тот же, что у классов разметки (часть 5в блока 5).
const theme: ShopTheme = { tokens: novaTokens, render: fakeRender };
const text = (content: Uint8Array): string => Buffer.from(content).toString('utf8');
const STYLE = /<style id="merfy-sections">([^<]*)<\/style>/;

const render = (request: SectionRenderRequest): Promise<string> =>
  Promise.resolve(`<h2 class="flex">${request.section}</h2>`);
const page: PageRender = { sections: { modules: RENDERS, render }, mode: 'live', code: ASSETS };

const withClasses = (classes: readonly string[]): CodeSection => ({
  ...GEO,
  meta: { uses: [], parts: [], classes: [...classes] },
});

// Входы с глобальным скриптом; placed: false — на страницах магазина секций нет вовсе.
function inputsWith(globalSection: CodeSection, placed = true): BuildInputs {
  return codeInputs((inputs) => {
    inputs.code.sections = inputs.code.sections.map((section) => (section.name === GEO.name ? globalSection : section));
    if (!placed) inputs.code = { sections: [globalSection], pages: {}, globals: [GEO.name] };
  });
}

async function cssOf(inputs: BuildInputs): Promise<string> {
  const html = text((await renderShopPage(inputs, '/', theme, page)).file.content);
  return STYLE.exec(html)?.[1] ?? '';
}

describe('классы глобального скрипта', () => {
  it('toggleClass("bg-primary") в глобальном скрипте — класс есть в CSS страницы, класс разметки на месте', async () => {
    const css = await cssOf(inputsWith(withClasses(['bg-primary'])));
    expect(css).toContain('.bg-primary');
    expect(css).toContain('.flex');
  });

  it('страница без размещённых секций, но с глобальным скриптом с классом — CSS построен, класс в нём', async () => {
    const css = await cssOf(inputsWith(withClasses(['bg-primary']), false));
    expect(css).toContain('.bg-primary');
  });

  it('глобальный скрипт без классов — CSS страницы не меняется: с секциями и без них', async () => {
    const plain = await cssOf(inputsWith(GEO));
    expect(plain).toContain('.flex');
    expect(await cssOf(inputsWith(withClasses([])))).toBe(plain);
    expect(await cssOf(inputsWith(withClasses([]), false))).toBe(await cssOf(inputsWith(GEO, false)));
    expect(await cssOf(inputsWith(withClasses([]), false))).toBe('');
  });
});
