import { describe, expect, it } from 'vitest';
import { sha256 } from '../src/canonical';
import { marksPartsOf, pageBundle, type CodeAssets } from '../src/code';
import type { BuildInputs } from '../src/inputs';
import { NO_SECTIONS, type PageRender } from '../src/sections-render';
import { ASSETS, RENDERS, SHELL_BUILD, codeInputs } from './support-code';

// Часть меток без скрипта секции в бандле (06.11): по HTML страницы — секция, сохранённая раньше, и секция без скрипта
// тоже её получают; в core.json её нет — бюджет ядра без неё.
const CORE = `${SHELL_BUILD.code}\nexport const marks = { name: 'marks' };`;
const SHELL = { ...SHELL_BUILD, hash: sha256(CORE), code: CORE };
const MARKS_ASSETS: CodeAssets = { ...ASSETS, shell: SHELL };
const HEART = '<button data-action="favorites.toggle" data-product-id="p1"></button>';

const inputsOf = (): BuildInputs =>
  codeInputs((inputs) => {
    if (inputs.shell !== null) inputs.shell.hash = SHELL.hash;
  });

const livePage = (): PageRender => ({
  sections: { ...NO_SECTIONS, modules: RENDERS },
  mode: 'live',
  code: MARKS_ASSETS,
});

async function bundleText(sections: string[]): Promise<string> {
  const bundle = await pageBundle(inputsOf(), 'home', livePage(), { sections });
  return new TextDecoder().decode(bundle?.file?.content);
}

describe('часть marks в бандле страницы', () => {
  it('метка в любом месте страницы подключает часть', () => {
    expect(marksPartsOf({ sections: [HEART] })).toEqual(['marks']);
    expect(marksPartsOf({ header: ['<span data-ref="cart-count">0</span>'], sections: [] })).toEqual(['marks']);
    expect(marksPartsOf({ footer: ['<a data-ref="profile" href="/login"></a>'], sections: [] })).toEqual(['marks']);
    expect(marksPartsOf({ overlay: ['<span data-ref="favorites-count"></span>'], sections: [] })).toEqual(['marks']);
  });

  it('страница без меток — без части', () => {
    expect(marksPartsOf({ sections: ['<a href="/wishlist">Избранное</a>'] })).toEqual([]);
  });

  it('страница с сердечком — бандл с частью marks, без него — без неё', async () => {
    expect(await bundleText([HEART])).toContain('name:"marks"');
    expect(await bundleText(['<p>Текст</p>'])).not.toContain('name:"marks"');
  });
});
