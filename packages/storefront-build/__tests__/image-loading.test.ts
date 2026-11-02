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
  });
});
