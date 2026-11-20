import { describe, expect, it } from 'vitest';
import { imageKeyOf, imageUrlsIn, isOurImage, markerUrlOf } from '../src/image-urls';

const HOSTS = ['minio.dev.merfy.ru', 'minio.merfy.ru'];
const DEV = 'https://minio.dev.merfy.ru/product-images/a.jpg';
const PROD = 'https://minio.merfy.ru/product-images/b.png';

describe('ключ оригинала и маркер', () => {
  it('ключ — путь адреса без хоста и первой косой черты, запрос не входит', () => {
    expect(imageKeyOf(DEV)).toBe('product-images/a.jpg');
    expect(imageKeyOf(`${PROD}?v=2`)).toBe('product-images/b.png');
    expect(imageKeyOf('https://x.ru/merfy-sites/media/t/s/1-1200.JPEG')).toBe('merfy-sites/media/t/s/1-1200.JPEG');
  });

  it('не картинки с копиями: gif, svg, сами копии и маркеры, корень, не адрес', () => {
    for (const url of [
      'https://x.ru/a.gif',
      'https://x.ru/a.svg',
      'https://x.ru/a.jpg.d.webp',
      'https://x.ru/a.jpg.m.webp',
      'https://x.ru/a.jpg.v.json',
      'https://x.ru/',
      'не адрес.jpg',
    ])
      expect(imageKeyOf(url)).toBeNull();
  });

  it('маркер — на хосте контура, а имя от пути: адрес с хостом прода читается с хоста dev', () => {
    expect(markerUrlOf('https://minio.dev.merfy.ru', DEV)).toBe(`${DEV}.v.json`);
    expect(markerUrlOf('https://minio.dev.merfy.ru', PROD)).toBe(
      'https://minio.dev.merfy.ru/product-images/b.png.v.json',
    );
    expect(markerUrlOf('https://minio.dev.merfy.ru', 'https://x.ru/a.svg')).toBeNull();
  });
});

describe('наши картинки', () => {
  it('хост из списка без учёта регистра и ключ с копиями', () => {
    expect(isOurImage(DEV, HOSTS)).toBe(true);
    expect(isOurImage('https://MINIO.merfy.ru/p/a.webp', HOSTS)).toBe(true);
    expect(isOurImage('https://cdn.example/a.jpg', HOSTS)).toBe(false);
    expect(isOurImage('https://minio.dev.merfy.ru/a.gif', HOSTS)).toBe(false);
  });

  it('обход строк на любой глубине: настройки, блоки, товары; адреса внутри разметки; по одному разу, по алфавиту', () => {
    const values = [
      { hero: { image: PROD, blocks: [{ settings: { photo: DEV } }, { settings: { photo: DEV } }] }, n: 3, ok: true },
      [`<p>Текст</p><img src="${DEV}" alt=""><img src='https://minio.dev.merfy.ru/p/c.webp'>`],
      { outside: 'https://cdn.example/a.jpg', copy: `${DEV}.d.webp`, video: 'https://minio.dev.merfy.ru/v.mp4' },
    ];
    expect(imageUrlsIn(values, HOSTS)).toEqual([PROD, DEV, 'https://minio.dev.merfy.ru/p/c.webp'].sort());
  });

  it('пусто — пустой список', () => {
    expect(imageUrlsIn([{}, [], null, 'текст'], HOSTS)).toEqual([]);
  });
});
