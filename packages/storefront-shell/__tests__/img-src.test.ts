import { afterEach, describe, expect, it } from 'vitest';
import { createElScope } from '../src/core/el';
import { setImgSrc } from '../src/core/img-src';
import { errorOf } from './core-support';

// Запись src у <img> при серверном srcset (модуль картинок, шаг 3): сборка ставит srcset у картинок нашего хранилища, а он
// главнее src — без снятия листание фото карточки и смена фото «Товара» ничего бы не показывали. Ядро (El.attr) srcset
// снимает; поведения вне ядра (card-photos) через setImgSrc ещё и берут srcset у такого же адреса на странице.
const SET = '/p/1.jpg.m.webp 800w, /p/1.jpg.d.webp 1600w';

function page(html: string) {
  const root = document.createElement('merfy-section');
  root.setAttribute('data-section', 'shop:product');
  root.setAttribute('data-section-id', 'product-1');
  root.innerHTML = html;
  document.body.append(root);
  return { root, scope: createElScope(root, new AbortController().signal) };
}

const attrs = (node: Element | null) => [
  node?.getAttribute('src'),
  node?.getAttribute('srcset'),
  node?.getAttribute('sizes'),
];

afterEach(() => {
  document.body.replaceChildren();
});

// Адреса в тестах разные: setImgSrc помнит srcset по адресу на всё время страницы.
describe('setImgSrc (поведения вне ядра: листание фото карточки)', () => {
  it('новый адрес без такой же картинки на странице: srcset снимается, sizes остаётся', () => {
    const { root } = page(`<img id="main" src="/a/1.jpg" srcset="${SET}" sizes="50vw">`);
    const main = root.querySelector('#main');
    if (main === null) throw new Error('нет картинки');
    setImgSrc(main, '/a/2.jpg');
    expect(attrs(main)).toEqual(['/a/2.jpg', null, '50vw']);
  });

  it('на странице есть картинка с тем же src и своим srcset (миниатюра): он переносится', () => {
    const { root } = page(
      `<img id="main" src="/b/1.jpg" srcset="${SET}"><img id="thumb" src="/b/2.jpg" srcset="/b/2.jpg.m.webp 800w">`,
    );
    const main = root.querySelector('#main');
    if (main === null) throw new Error('нет картинки');
    setImgSrc(main, '/b/2.jpg');
    expect(attrs(main)).toEqual(['/b/2.jpg', '/b/2.jpg.m.webp 800w', null]);
  });

  it('возврат к прежней картинке этой же рамки возвращает её srcset', () => {
    const { root } = page(`<img id="main" src="/c/1.jpg" srcset="${SET}">`);
    const main = root.querySelector('#main');
    if (main === null) throw new Error('нет картинки');
    setImgSrc(main, '/c/2.jpg');
    expect(main.getAttribute('srcset')).toBeNull();
    setImgSrc(main, '/c/1.jpg');
    expect(attrs(main)).toEqual(['/c/1.jpg', SET, null]);
  });

  it('картинка без srcset остаётся без него', () => {
    const { root } = page('<img id="main" src="/d/1.jpg">');
    const main = root.querySelector('#main');
    if (main === null) throw new Error('нет картинки');
    setImgSrc(main, '/d/2.jpg');
    expect(attrs(main)).toEqual(['/d/2.jpg', null, null]);
  });
});

describe('El.attr(src) у картинки с серверным srcset (секция «Товар»: миниатюры, стрелки, вариант)', () => {
  it('новое фото показывается: srcset снят, sizes остаётся', () => {
    const { scope } = page(`<img data-ref="photo" src="/e/1.jpg" srcset="${SET}" sizes="100vw">`);
    const photo = scope.ref('photo');
    photo?.attr('src', '/e/2.jpg');
    expect([photo?.attr('src'), photo?.attr('srcset'), photo?.attr('sizes')]).toEqual(['/e/2.jpg', null, '100vw']);
  });

  it('другие атрибуты srcset не снимают', () => {
    const { scope } = page('<img data-ref="photo" src="/f/1.jpg" srcset="x 1x" alt="">');
    scope.ref('photo')?.attr('alt', 'Шарф');
    expect(scope.ref('photo')?.attr('srcset')).toBe('x 1x');
  });

  it('srcset секциям не открыт: запись — attr-forbidden', () => {
    const { scope } = page('<img data-ref="photo" src="/g/1.jpg">');
    const photo = scope.ref('photo');
    expect(errorOf(() => photo?.attr('srcset', SET))).toMatchObject({ code: 'attr-forbidden' });
  });
});
