import { describe, expect, it } from 'vitest';
import { marksPartsOf, pageBundle } from '../src/code';
import { NO_SECTIONS, type PageRender } from '../src/sections-render';
import { ASSETS, RENDERS, codeInputs } from './support-code';

// Часть меток без скрипта секции в бандле (06.11): по HTML страницы — секция, сохранённая раньше, и секция без скрипта
// тоже её получают; в core.json её нет — бюджет ядра без неё.
const HEART = '<button data-action="favorites.toggle" data-product-id="p1"></button>';

const livePage = (): PageRender => ({
  sections: { ...NO_SECTIONS, modules: RENDERS },
  mode: 'live',
  code: ASSETS,
});

async function bundleText(sections: string[]): Promise<string> {
  const bundle = await pageBundle(codeInputs(), 'home', livePage(), { sections });
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
