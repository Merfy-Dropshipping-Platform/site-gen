/**
 * @jest-environment jsdom
 *
 * Окно «Товар добавлен в корзину» встаёт ПОД ИКОНКОЙ КОРЗИНЫ, а не по центру
 * экрана.
 *
 * Откуда задача. Владелец, 19.09 (тема bloom): «не на том месте стоит блок
 * корзины — щас она в центре, а надо чтобы была под корзиной справа сверху».
 * Замер «до» на живом стенде bloom (Chromium 1920×1080 и 1440×900) отдавал у
 * контейнера окна `items-center justify-center` и карточку по центру вьюпорта,
 * тогда как эталон верстальщиков (bloom.merfy.ru) держит окно у правого края
 * шапки: правый край карточки 1572 при 1920 — ровно правый край иконки
 * корзины (1540…1572).
 *
 * Почему не классами с числами. Правые поля шапки у тем разные
 * (порт bloom/flux — `px-20 2xl:px-[300px]`, общий Header —
 * `md:px-10 lg:px-16 xl:px-20 2xl:px-[var(--header-container-px-2xl,280px)]`),
 * а разметка окна ОДНА на темы. Жёсткий `pr-[348px]` эталона встал бы под
 * корзину только у bloom на 2xl. Поэтому окно якорится к реальному
 * прямоугольнику кнопки корзины, а классы держат только фолбэк.
 *
 * Что сторожим: пропала привязка к кнопке — окно молча уезжает обратно в
 * центр, и увидеть это можно только глазами на живом стенде.
 */
import { createCartAddedModal } from '../runtime/cart-added-modal';

const deps = {
  formatPrice: (v: number) => `${v} ₽`,
  getCartCount: () => 3,
  productPathPrefix: '/products',
  themeKey: 'bloom',
};

const mountDom = (withCartButton: boolean) => {
  document.body.innerHTML = `
    <header>
      ${withCartButton ? '<button type="button" data-cart-open aria-label="Корзина"></button>' : ''}
    </header>
    <div data-cart-added-modal class="fixed inset-0 hidden">
      <section data-cart-modal-card class="translate-y-3 opacity-0">
        <p data-cart-modal-brand></p>
        <a data-cart-modal-product-link href="#"><img data-cart-modal-image /></a>
        <a data-cart-modal-name href="#"></a>
        <p data-cart-modal-volume></p>
        <p data-cart-modal-price></p>
        <a data-cart-modal-cart-link href="/cart"></a>
      </section>
    </div>`;
  const card = document.querySelector<HTMLElement>('[data-cart-modal-card]')!;
  // Ширина карточки — живой замер (в jsdom раскладки нет): 520px, как max-w от md.
  card.getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 520, height: 334, top: 0, right: 520, bottom: 334, left: 0 }) as DOMRect;
  const button = document.querySelector<HTMLElement>('[data-cart-open]');
  if (button) {
    // jsdom не считает раскладку — подставляем прямоугольник живого замера
    // (bloom, 1920×1080: иконка корзины 1540…1572, низ 96).
    button.getBoundingClientRect = () =>
      ({ x: 1540, y: 64, width: 32, height: 32, top: 64, right: 1572, bottom: 96, left: 1540 }) as DOMRect;
  }
  Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
  return document.querySelector<HTMLElement>('[data-cart-added-modal]')!;
};

const payload = {
  productId: 'p1',
  name: 'Увлажняющее молочко',
  price: '1 190 ₽',
  image: '/img.jpg',
};

describe('окно «Товар добавлен в корзину» — привязка к иконке корзины', () => {
  it('ставит окно под иконкой корзины и по её оси', () => {
    const modal = mountDom(true);
    createCartAddedModal(deps).open(payload);

    // Верх окна — низ иконки (96) + зазор 12.
    expect(modal.style.getPropertyValue('--cart-modal-top')).toBe('108px');
    // Ось иконки 1540…1572 → 1556; карточка 520 → правый край 1816,
    // отступ справа 1920 − 1816 = 104. Владелец, 19.09: «надо правее прям
    // напротив корзины» — равнение по правому краю иконки (348px) уводило окно
    // целиком влево от неё.
    expect(modal.style.getPropertyValue('--cart-modal-right')).toBe('104px');
  });

  it('у самого края экрана прижимает окно к кромке, а не за неё', () => {
    const modal = mountDom(true);
    const button = document.querySelector<HTMLElement>('[data-cart-open]')!;
    // Иконка вплотную к правому краю: ось 1904, половина карточки 260 —
    // окно вышло бы за экран на 244px.
    button.getBoundingClientRect = () =>
      ({ x: 1888, y: 64, width: 32, height: 32, top: 64, right: 1920, bottom: 96, left: 1888 }) as DOMRect;
    createCartAddedModal(deps).open(payload);

    expect(modal.style.getPropertyValue('--cart-modal-right')).toBe('16px');
  });

  it('на прокрученной странице не уводит окно за верх экрана', () => {
    const modal = mountDom(true);
    const button = document.querySelector<HTMLElement>('[data-cart-open]')!;
    // Шапка уехала вверх вместе со страницей (живой замер 390×844).
    button.getBoundingClientRect = () =>
      ({ x: 294, y: -442, width: 32, height: 32, top: -442, right: 326, bottom: -410, left: 294 }) as DOMRect;
    createCartAddedModal(deps).open(payload);

    expect(modal.style.getPropertyValue('--cart-modal-top')).toBe('16px');
  });

  it('без кнопки корзины оставляет фолбэк из классов (переменные не проставлены)', () => {
    const modal = mountDom(false);
    createCartAddedModal(deps).open(payload);

    expect(modal.style.getPropertyValue('--cart-modal-top')).toBe('');
    expect(modal.style.getPropertyValue('--cart-modal-right')).toBe('');
  });
});
