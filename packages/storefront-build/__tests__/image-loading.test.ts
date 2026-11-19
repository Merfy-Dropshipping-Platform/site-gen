import { describe, expect, it } from 'vitest';
import { imgTags, withImageLoading, withImgLoading } from '../src/image-loading';
import { EMPTY_PAGE_CONTENT } from '../src/sections-render';

const page = (parts: { header?: string[]; sections: string[]; footer?: string[]; overlay?: string[] }) => ({
  ...EMPTY_PAGE_CONTENT,
  ...parts,
});

describe('порядок загрузки картинок', () => {
  it('остальные картинки — ленивые и с decoding="async"', () => {
    expect(withImgLoading('<div><img src="/a.jpg" alt=""></div>')).toBe(
      '<div><img src="/a.jpg" alt="" loading="lazy" decoding="async"></div>',
    );
  });

  it('главная картинка — eager и fetchpriority="high", её lazy заменяется', () => {
    expect(withImgLoading('<img src="/a.jpg" loading="lazy" alt="">', 0)).toBe(
      '<img src="/a.jpg" alt="" loading="eager" fetchpriority="high" decoding="async">',
    );
  });

  it('loading и fetchpriority автора снимаются — их решает платформа; свой decoding остаётся', () => {
    expect(withImgLoading('<img src="/a.jpg" loading="eager" fetchpriority="high" decoding="sync">')).toBe(
      '<img src="/a.jpg" decoding="sync" loading="lazy">',
    );
    expect(withImgLoading('<img LOADING=eager src="/a.jpg" fetchpriority=\'low\' />', 0)).toBe(
      '<img src="/a.jpg" loading="eager" fetchpriority="high" decoding="async" />',
    );
  });

  it('самозакрытый тег, тег без атрибутов, значения без кавычек и с «>» внутри', () => {
    expect(withImgLoading('<img/>')).toBe('<img loading="lazy" decoding="async"/>');
    expect(withImgLoading('<IMG>')).toBe('<IMG loading="lazy" decoding="async">');
    expect(withImgLoading('<img src=/a.jpg alt=x>')).toBe('<img src=/a.jpg alt=x loading="lazy" decoding="async">');
    expect(withImgLoading('<img alt="a > b" src="/a.jpg">')).toBe(
      '<img alt="a > b" src="/a.jpg" loading="lazy" decoding="async">',
    );
  });

  it('в скриптах, стилях, комментариях и title картинки не ищутся', () => {
    const html =
      '<script>const t = "<img src=x>";</script><style>a::after{content:"<img>"}</style><!-- <img src=y> --><svg><title><img></title></svg>';
    expect(withImgLoading(html)).toBe(html);
    expect(imgTags('<SCRIPT type="module">"<img>"</SCRIPT><img>')).toHaveLength(1);
  });

  it('<imgx> и <image> — не картинки', () => {
    expect(withImgLoading('<image href="/a.svg"/><imgx>')).toBe('<image href="/a.svg"/><imgx>');
  });

  it('картинка в <template> — ленивая, но главной не бывает', () => {
    const html = '<template><img data-ref="image"></template><img src="/b.jpg">';
    const tags = imgTags(html);
    expect(tags.map((tag) => tag.inTemplate)).toEqual([true, false]);
  });
});

describe('страница целиком', () => {
  it('главная — первая картинка <main>; шапка, подвал и окна — только ленивые', () => {
    const out = withImageLoading(
      page({
        header: ['<nav><img src="/menu.jpg"></nav>'],
        sections: ['<h1>Текст</h1>', '<template><img></template><img src="/hero.jpg"><img src="/2.jpg">'],
        footer: ['<img src="/f.jpg">'],
        overlay: ['<img src="/search.jpg">'],
      }),
    );
    expect(out.header).toEqual(['<nav><img src="/menu.jpg" loading="lazy" decoding="async"></nav>']);
    expect(out.sections).toEqual([
      '<h1>Текст</h1>',
      '<template><img loading="lazy" decoding="async"></template><img src="/hero.jpg" loading="eager" fetchpriority="high" decoding="async"><img src="/2.jpg" loading="lazy" decoding="async">',
    ]);
    expect(out.footer).toEqual(['<img src="/f.jpg" loading="lazy" decoding="async">']);
    expect(out.overlay).toEqual(['<img src="/search.jpg" loading="lazy" decoding="async">']);
  });

  it('без картинок в <main> главной нет; списки, которых нет, не появляются', () => {
    const out = withImageLoading(page({ sections: ['<p>Без картинок</p>'] }));
    expect(out.sections).toEqual(['<p>Без картинок</p>']);
    expect('header' in out).toBe(false);
    expect(out.mainImage).toBeUndefined();
    expect(out.mainImageLink).toBeUndefined();
  });
});

const EAGER = 'loading="eager" fetchpriority="high"';
const hero = '<img src="https://cdn.example/hero.jpg" alt="">';

describe('главная картинка — первая видимая с адресом', () => {
  it('обычный случай: eager и high, preload и адрес для preconnect', () => {
    const out = withImageLoading(page({ sections: [hero, '<img src="/2.jpg">'] }));
    expect(out.sections[0]).toBe(`<img src="https://cdn.example/hero.jpg" alt="" ${EAGER} decoding="async">`);
    expect(out.sections[1]).toBe('<img src="/2.jpg" loading="lazy" decoding="async">');
    expect(out.mainImage).toBe('https://cdn.example/hero.jpg');
    expect(out.mainImageLink).toBe(
      '<link rel="preload" as="image" href="https://cdn.example/hero.jpg" fetchpriority="high">',
    );
  });

  it('первая картинка скрыта (hidden) — главной становится следующая видимая', () => {
    const out = withImageLoading(page({ sections: [`<img src="/h.jpg" hidden>${hero}`] }));
    expect(out.sections[0]).toBe(
      `<img src="/h.jpg" hidden loading="lazy" decoding="async"><img src="https://cdn.example/hero.jpg" alt="" ${EAGER} decoding="async">`,
    );
    expect(out.mainImage).toBe('https://cdn.example/hero.jpg');
  });

  it('первая картинка под скрытым предком, в style с display:none, в <noscript> и закрытом <dialog> — не главная', () => {
    const hidden = [
      '<div hidden><p><img src="/a.jpg"></p></div>',
      '<div style="color: red; display: none"><img src="/b.jpg"></div>',
      '<div style="visibility:hidden !important"><img src="/c.jpg"></div>',
      '<noscript><img src="/d.jpg"></noscript>',
      '<dialog><img src="/e.jpg"></dialog>',
    ];
    const out = withImageLoading(page({ sections: [...hidden, hero] }));
    expect(out.sections.slice(0, 5).join('')).not.toContain('eager');
    expect(out.sections[5]).toContain(EAGER);
    expect(out.mainImage).toBe('https://cdn.example/hero.jpg');
  });

  it('скрытый предок закрыт — следующая картинка после него видима; открытый <dialog open> и пустой стиль не скрывают', () => {
    const html =
      '<div hidden><img src="/a.jpg"></div><dialog open><img src="/b.jpg"></dialog><img src="/c.jpg" style="color:red">';
    const out = withImageLoading(page({ sections: [html] }));
    expect(out.mainImage).toBe('/b.jpg');
    expect(out.sections[0]).toContain(`<img src="/b.jpg" ${EAGER} decoding="async">`);
  });

  it('самозакрытый и пустой элементы со скрытием не оставляют предка открытым', () => {
    const out = withImageLoading(page({ sections: ['<br hidden><span hidden/><img src="/a.jpg">'] }));
    expect(out.mainImage).toBe('/a.jpg');
  });

  it('первая картинка без src — главной становится следующая с адресом', () => {
    const out = withImageLoading(
      page({ sections: ['<img data-ref="cover" alt="" loading="eager" fetchpriority="high">', '<img src=" ">', hero] }),
    );
    expect(out.sections[0]).toBe('<img data-ref="cover" alt="" loading="lazy" decoding="async">');
    expect(out.sections[1]).toBe('<img src=" " loading="lazy" decoding="async">');
    expect(out.sections[2]).toContain(EAGER);
    expect(out.mainImage).toBe('https://cdn.example/hero.jpg');
  });

  it('картинка с srcset и sizes — в preload imagesrcset и imagesizes', () => {
    const img =
      '<img src="/a-800.jpg" srcset="/a-400.jpg 400w, /a-800.jpg 800w" sizes="(max-width: 600px) 100vw, 50vw">';
    const out = withImageLoading(page({ sections: [img] }));
    expect(out.mainImageLink).toBe(
      '<link rel="preload" as="image" href="/a-800.jpg" imagesrcset="/a-400.jpg 400w, /a-800.jpg 800w" imagesizes="(max-width: 600px) 100vw, 50vw" fetchpriority="high">',
    );
    expect(out.mainImage).toBe('/a-800.jpg');
  });

  it('картинка только с srcset — главная; без src нет href и адреса для preconnect; sizes без srcset не переносится', () => {
    const only = withImageLoading(page({ sections: ['<img srcset="/a-400.jpg 400w, /a-800.jpg 800w">'] }));
    expect(only.sections[0]).toContain(EAGER);
    expect(only.mainImage).toBeUndefined();
    expect(only.mainImageLink).toBe(
      '<link rel="preload" as="image" imagesrcset="/a-400.jpg 400w, /a-800.jpg 800w" fetchpriority="high">',
    );
    const sizes = withImageLoading(page({ sections: ['<img src="/a.jpg" sizes="50vw">'] }));
    expect(sizes.mainImageLink).toBe('<link rel="preload" as="image" href="/a.jpg" fetchpriority="high">');
  });

  it('кавычка в адресе экранируется в preload', () => {
    const out = withImageLoading(page({ sections: [`<img src='/a"b.jpg'>`] }));
    expect(out.mainImageLink).toBe('<link rel="preload" as="image" href="/a&quot;b.jpg" fetchpriority="high">');
  });

  it('подходящей нет — eager и high не получает никто, preload и адреса нет, loading автора снят', () => {
    const sections = [
      '<img data-ref="cover" hidden loading="eager" fetchpriority="high">',
      '<div hidden><img src="/a.jpg"></div>',
      '<template><img src="/t.jpg"></template>',
    ];
    const out = withImageLoading(page({ sections }));
    expect(out.sections.join('')).not.toContain('eager');
    expect(out.sections.join('')).not.toContain('fetchpriority');
    expect(out.mainImage).toBeUndefined();
    expect(out.mainImageLink).toBeUndefined();
  });

  it('главная — в первой секции, где есть подходящая', () => {
    const out = withImageLoading(page({ sections: ['<img hidden src="/h.jpg">', hero, '<img src="/3.jpg">'] }));
    expect(out.sections.filter((html) => html.includes(EAGER))).toEqual([
      `<img src="https://cdn.example/hero.jpg" alt="" ${EAGER} decoding="async">`,
    ]);
  });
});
