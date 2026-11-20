import type { Marker } from '@merfy-dropshipping-platform/images';
import { describe, expect, it } from 'vitest';
import { withImageLoading } from '../src/image-loading';
import { DEFAULT_SIZES, withImageSizes, withImgSizes } from '../src/image-sizes';
import type { BuildInputs } from '../src/inputs';
import { EMPTY_PAGE_CONTENT } from '../src/sections-render';

type Images = NonNullable<BuildInputs['images']>;

const ORIGIN = 'https://minio.dev.merfy.ru';
const PHOTO = `${ORIGIN}/product-images/a.jpg`;
const FOREIGN_HOST = 'https://minio.merfy.ru/product-images/b.jpg';
const OUTSIDE = 'https://cdn.example/c.jpg';

// Маркер оригинала шириной width с копиями данных видов; ключи копий сервис пишет как хочет — сборка их не читает.
function markerOf(kinds: ('d' | 'm')[], width = 2400): Marker {
  const variants = kinds.map((kind) => ({ kind, width: kind === 'd' ? 1600 : 800, key: `any/${kind}` }));
  return { rulesVersion: 1, status: 'ok', attempts: 1, width, height: 1600, variants };
}

const imagesOf = (markers: Record<string, Marker>): Images => ({ origin: ORIGIN, markers });
const BOTH = imagesOf({ [PHOTO]: markerOf(['m', 'd']) });
const SET = `${ORIGIN}/product-images/a.jpg.m.webp 800w, ${ORIGIN}/product-images/a.jpg.d.webp 1600w`;

const page = (parts: { header?: string[]; sections: string[]; footer?: string[]; overlay?: string[] }) => ({
  ...EMPTY_PAGE_CONTENT,
  ...parts,
});

describe('srcset у картинок нашего хранилища', () => {
  it('есть маркер с обеими копиями: srcset от меньшей к большей, sizes по умолчанию, src — оригинал', () => {
    expect(withImgSizes(`<img src="${PHOTO}" alt="">`, BOTH)).toBe(
      `<img src="${PHOTO}" alt="" srcset="${SET}" sizes="${DEFAULT_SIZES}">`,
    );
  });

  it('sizes по умолчанию: 266 px на телефоне (DPR 3 даёт копию 800), весь экран дальше', () => {
    expect(DEFAULT_SIZES).toBe('(max-width: 767px) 266px, 100vw');
  });

  const v2Marker = (width: number, kinds: Marker['variants']): Marker => ({
    rulesVersion: 2,
    status: 'ok',
    attempts: 1,
    width,
    height: 800,
    variants: kinds,
  });
  const V2_FULL = v2Marker(1200, [
    { kind: 's', width: 400, key: 'any/s' },
    { kind: 'm', width: 800, key: 'any/m' },
    { kind: 'd', width: 1200, key: 'any/d' },
  ]);
  const BASE = `${ORIGIN}/product-images/a.jpg`;

  it('обложка без своего sizes: srcset без 400w — только m и d, ширина d фактическая (1200w)', () => {
    expect(withImgSizes(`<img src="${PHOTO}">`, imagesOf({ [PHOTO]: V2_FULL }))).toBe(
      `<img src="${PHOTO}" srcset="${BASE}.m.webp 800w, ${BASE}.d.webp 1200w" sizes="${DEFAULT_SIZES}">`,
    );
  });

  it('карточка со своим sizes: srcset с 400w', () => {
    const own = '(max-width: 767px) 50vw, 25vw';
    expect(withImgSizes(`<img src="${PHOTO}" sizes="${own}">`, imagesOf({ [PHOTO]: V2_FULL }))).toBe(
      `<img src="${PHOTO}" sizes="${own}" srcset="${BASE}.s.webp 400w, ${BASE}.m.webp 800w, ${BASE}.d.webp 1200w">`,
    );
  });

  it('копия s одна (оригинал 600–799 px): без своего sizes srcset не нужен, со своим — есть', () => {
    const only = imagesOf({ [PHOTO]: v2Marker(700, [{ kind: 's', width: 400, key: 'any/s' }]) });
    expect(withImgSizes(`<img src="${PHOTO}">`, only)).toBe(`<img src="${PHOTO}">`);
    expect(withImgSizes(`<img src="${PHOTO}" sizes="50vw">`, only)).toBe(
      `<img src="${PHOTO}" sizes="50vw" srcset="${BASE}.s.webp 400w, ${PHOTO} 700w">`,
    );
  });

  it('смесь версий в одной странице: маркер версии 1 и версии 2 строят srcset каждый по своим копиям', () => {
    const other = `${ORIGIN}/product-images/z.png`;
    const images = imagesOf({ [PHOTO]: markerOf(['m', 'd']), [other]: V2_FULL });
    expect(withImgSizes(`<img src="${PHOTO}"><img src="${other}" sizes="50vw">`, images)).toBe(
      `<img src="${PHOTO}" srcset="${SET}" sizes="${DEFAULT_SIZES}">` +
        `<img src="${other}" sizes="50vw" srcset="${ORIGIN}/product-images/z.png.s.webp 400w, ${ORIGIN}/product-images/z.png.m.webp 800w, ${ORIGIN}/product-images/z.png.d.webp 1200w">`,
    );
  });

  it('нет маркера — картинка как есть', () => {
    const html = `<img src="${PHOTO}" alt="">`;
    expect(withImgSizes(html, imagesOf({}))).toBe(html);
  });

  it('только телефонная копия: в конце оригинал с его шириной, по его адресу', () => {
    const images = imagesOf({ [PHOTO]: markerOf(['m'], 1200) });
    expect(withImgSizes(`<img src="${PHOTO}">`, images)).toBe(
      `<img src="${PHOTO}" srcset="${ORIGIN}/product-images/a.jpg.m.webp 800w, ${PHOTO} 1200w" sizes="${DEFAULT_SIZES}">`,
    );
  });

  it('маркер без копий (маленькая картинка, failed) — srcset не нужен', () => {
    const small: Marker = { ...markerOf([], 600), variants: [] };
    const failed: Marker = { rulesVersion: 1, status: 'failed', attempts: 3, width: null, height: null, variants: [] };
    for (const marker of [small, failed]) {
      const html = `<img src="${PHOTO}">`;
      expect(withImgSizes(html, imagesOf({ [PHOTO]: marker }))).toBe(html);
    }
  });

  it('адрес с чужим хостом из данных: копии берутся с хоста контура, оригинал — по своему адресу', () => {
    const images = imagesOf({ [FOREIGN_HOST]: markerOf(['m'], 1200) });
    expect(withImgSizes(`<img src="${FOREIGN_HOST}">`, images)).toBe(
      `<img src="${FOREIGN_HOST}" srcset="${ORIGIN}/product-images/b.jpg.m.webp 800w, ${FOREIGN_HOST} 1200w" sizes="${DEFAULT_SIZES}">`,
    );
  });

  it('внешняя ссылка без маркера, <source> и background-image не трогаются', () => {
    const html = `<picture><source srcset="${PHOTO}"><img src="${OUTSIDE}"></picture><div style="background-image:url(${PHOTO})"></div>`;
    expect(withImgSizes(html, BOTH)).toBe(html);
  });

  it('картинка без src и с пустым src — как есть', () => {
    const html = '<img data-ref="image" alt=""><img src="">';
    expect(withImgSizes(html, BOTH)).toBe(html);
  });

  it('несколько картинок: каждая со своим маркером, самозакрытый тег и теги без маркера', () => {
    const other = `${ORIGIN}/product-images/z.png`;
    const images = imagesOf({ [PHOTO]: markerOf(['m', 'd']), [other]: markerOf(['d']) });
    const out = withImgSizes(`<img src="${PHOTO}"/><img src="/local.jpg"><img src="${other}" alt="">`, images);
    expect(out).toBe(
      `<img src="${PHOTO}" srcset="${SET}" sizes="${DEFAULT_SIZES}"/><img src="/local.jpg"><img src="${other}" alt="" srcset="${ORIGIN}/product-images/z.png.d.webp 1600w" sizes="${DEFAULT_SIZES}">`,
    );
  });
});

describe('шаблон главнее', () => {
  it('свой srcset автора остаётся целиком, sizes не добавляется', () => {
    const html = `<img src="${PHOTO}" srcset="${PHOTO} 1x, ${PHOTO} 2x">`;
    expect(withImgSizes(html, BOTH)).toBe(html);
  });

  it('свой srcset с sizes — тоже без изменений', () => {
    const html = `<img src="${PHOTO}" srcset="/a.jpg 400w" sizes="50vw">`;
    expect(withImgSizes(html, BOTH)).toBe(html);
  });

  it('свой sizes остаётся: платформа добавляет только srcset (карточки сеток)', () => {
    expect(withImgSizes(`<img src="${PHOTO}" sizes="(max-width: 767px) 50vw, 25vw">`, BOTH)).toBe(
      `<img src="${PHOTO}" sizes="(max-width: 767px) 50vw, 25vw" srcset="${SET}">`,
    );
  });
});

describe('страница целиком', () => {
  it('шапка, секции, подвал и окна получают srcset; без images страница прежняя', () => {
    const content = page({
      header: [`<img src="${PHOTO}">`],
      sections: [`<img src="${PHOTO}">`],
      footer: [`<img src="${PHOTO}">`],
      overlay: [`<img src="${PHOTO}">`],
    });
    const out = withImageSizes(content, BOTH);
    const expected = `<img src="${PHOTO}" srcset="${SET}" sizes="${DEFAULT_SIZES}">`;
    expect([out.header, out.sections, out.footer, out.overlay]).toEqual([
      [expected],
      [expected],
      [expected],
      [expected],
    ]);
    expect(withImageSizes(content, undefined)).toBe(content);
  });

  it('списки, которых нет, не появляются', () => {
    const out = withImageSizes(page({ sections: ['<p>Без картинок</p>'] }), BOTH);
    expect(out.sections).toEqual(['<p>Без картинок</p>']);
    expect('header' in out).toBe(false);
  });
});

describe('предзагрузка главной картинки', () => {
  it('у главной есть srcset — preload получает imagesrcset и imagesizes, href остаётся оригиналом', () => {
    const out = withImageLoading(withImageSizes(page({ sections: [`<img src="${PHOTO}" alt="">`] }), BOTH));
    expect(out.mainImage).toBe(PHOTO);
    expect(out.mainImageLink).toBe(
      `<link rel="preload" as="image" href="${PHOTO}" imagesrcset="${SET}" imagesizes="${DEFAULT_SIZES}" fetchpriority="high">`,
    );
    expect(out.sections[0]).toContain(`srcset="${SET}"`);
    expect(out.sections[0]).toContain('loading="eager" fetchpriority="high"');
  });

  it('главная без своего sizes: preload без 400w, а у неё со своим sizes — с 400w', () => {
    const base = `${ORIGIN}/product-images/a.jpg`;
    const marker: Marker = {
      rulesVersion: 2,
      status: 'ok',
      attempts: 1,
      width: 2400,
      height: 1600,
      variants: [
        { kind: 's', width: 400, key: 'any/s' },
        { kind: 'm', width: 800, key: 'any/m' },
        { kind: 'd', width: 1600, key: 'any/d' },
      ],
    };
    const images = imagesOf({ [PHOTO]: marker });
    const cover = withImageLoading(withImageSizes(page({ sections: [`<img src="${PHOTO}">`] }), images));
    expect(cover.mainImageLink).toContain(`imagesrcset="${base}.m.webp 800w, ${base}.d.webp 1600w"`);
    expect(cover.mainImageLink).not.toContain('400w');
    const card = withImageLoading(withImageSizes(page({ sections: [`<img src="${PHOTO}" sizes="50vw">`] }), images));
    expect(card.mainImageLink).toContain('400w');
  });

  it('нет копий — preload прежний, без imagesrcset', () => {
    const out = withImageLoading(withImageSizes(page({ sections: [`<img src="${PHOTO}">`] }), imagesOf({})));
    expect(out.mainImageLink).toBe(`<link rel="preload" as="image" href="${PHOTO}" fetchpriority="high">`);
  });

  it('свой sizes автора переходит в imagesizes', () => {
    const html = `<img src="${PHOTO}" sizes="50vw">`;
    const out = withImageLoading(withImageSizes(page({ sections: [html] }), BOTH));
    expect(out.mainImageLink).toContain('imagesizes="50vw"');
    expect(out.mainImageLink).toContain(`imagesrcset="${SET}"`);
  });
});
