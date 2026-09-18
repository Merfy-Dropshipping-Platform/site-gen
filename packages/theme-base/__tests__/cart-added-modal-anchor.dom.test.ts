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
  it('ставит окно под иконкой корзины и по её правому краю', () => {
    const modal = mountDom(true);
    createCartAddedModal(deps).open(payload);

    // Верх окна — низ иконки (96) + зазор 12.
    expect(modal.style.getPropertyValue('--cart-modal-top')).toBe('108px');
    // Правый край окна = правый край иконки: 1920 − 1572.
    expect(modal.style.getPropertyValue('--cart-modal-right')).toBe('348px');
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
