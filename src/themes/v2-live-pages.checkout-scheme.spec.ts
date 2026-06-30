import { patchCheckoutBlockScheme } from './v2-live-pages';

// Guard for Figma 1:19998 — независимая «Цветовая схема» узлов «Оформление
// заказа» (checkout-form) и «Сводка заказа» (checkout-summary) на verbatim live.
// patchCheckoutBlockScheme дописывает color-scheme-N в class секции блока.
describe('patchCheckoutBlockScheme', () => {
  // Реальная форма секции из CheckoutForm.astro: class ПЕРЕД data-block,
  // root уже несёт bg-[rgb(var(--color-bg))] (перекрашивается из --color-*).
  const formSection =
    '<section class="relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] flex flex-col gap-8" data-block="checkout-form" style="padding-top:0px; padding-bottom:0px;">FORM</section>';
  const summarySection =
    '<section class="relative w-full bg-[rgb(var(--color-bg))] flex flex-col gap-6" data-block="checkout-summary">SUM</section>';

  it('дописывает color-scheme-N в class секции checkout-form', () => {
    const out = patchCheckoutBlockScheme(formSection, 'checkout-form', 'scheme-4');
    expect(out).toContain('flex flex-col gap-8 color-scheme-4" data-block="checkout-form"');
  });

  it('strip префикса scheme- → color-scheme-2', () => {
    const out = patchCheckoutBlockScheme(summarySection, 'checkout-summary', 'scheme-2');
    expect(out).toContain('gap-6 color-scheme-2" data-block="checkout-summary"');
  });

  it('идемпотентность: повторный патч не дублирует класс', () => {
    const once = patchCheckoutBlockScheme(formSection, 'checkout-form', 'scheme-4');
    const twice = patchCheckoutBlockScheme(once, 'checkout-form', 'scheme-4');
    expect(twice).toEqual(once);
    expect((twice.match(/color-scheme-4/g) || []).length).toBe(1);
  });

  it('патч формы НЕ трогает сводку (и наоборот)', () => {
    const both = formSection + summarySection;
    const out = patchCheckoutBlockScheme(both, 'checkout-form', 'scheme-3');
    expect(out).toContain('gap-8 color-scheme-3" data-block="checkout-form"');
    expect(out).toContain('gap-6" data-block="checkout-summary"'); // сводка не тронута
  });

  it('no-op при пустой/undefined схеме', () => {
    expect(patchCheckoutBlockScheme(formSection, 'checkout-form', undefined)).toEqual(formSection);
    expect(patchCheckoutBlockScheme(formSection, 'checkout-form', '')).toEqual(formSection);
    expect(patchCheckoutBlockScheme(formSection, 'checkout-form', 123 as unknown)).toEqual(formSection);
  });

  it('no-op если секции такого блока нет в html', () => {
    const html = '<section class="x" data-block="other">X</section>';
    expect(patchCheckoutBlockScheme(html, 'checkout-form', 'scheme-4')).toEqual(html);
  });
});
