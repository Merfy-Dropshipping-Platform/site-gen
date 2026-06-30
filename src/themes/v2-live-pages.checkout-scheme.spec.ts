import { patchCheckoutBlockScheme } from './v2-live-pages';

// Guard for Figma 1:19998 — независимая «Цветовая схема» ПАНЕЛЕЙ checkout
// (form/summary). patchCheckoutBlockScheme дописывает color-scheme-N в class
// панели (data-checkout-column) — она заливает фон --color-bg во всю ширину
// половины. class идёт ДО data-checkout-column (порядок в checkout.astro).
describe('patchCheckoutBlockScheme', () => {
  const formPane =
    '<div class="mfy-checkout-pane mfy-checkout-pane--form" data-checkout-column="form"><section class="relative w-full bg-[rgb(var(--color-bg))]" data-block="checkout-form">F</section></div>';
  const summaryPane =
    '<div class="mfy-checkout-pane mfy-checkout-pane--summary" data-checkout-column="summary">S</div>';

  it('дописывает color-scheme-N в class панели form', () => {
    const out = patchCheckoutBlockScheme(formPane, 'form', 'scheme-4');
    expect(out).toContain('mfy-checkout-pane--form color-scheme-4" data-checkout-column="form"');
  });

  it('strip префикса scheme- → color-scheme-2', () => {
    const out = patchCheckoutBlockScheme(summaryPane, 'summary', 'scheme-2');
    expect(out).toContain('color-scheme-2" data-checkout-column="summary"');
  });

  it('идемпотентно: класс не дублируется', () => {
    const once = patchCheckoutBlockScheme(formPane, 'form', 'scheme-4');
    const twice = patchCheckoutBlockScheme(once, 'form', 'scheme-4');
    expect(twice).toEqual(once);
    expect((twice.match(/color-scheme-4/g) || []).length).toBe(1);
  });

  it('патч формы НЕ трогает сводку', () => {
    const both = formPane + summaryPane;
    const out = patchCheckoutBlockScheme(both, 'form', 'scheme-3');
    expect(out).toContain('pane--form color-scheme-3" data-checkout-column="form"');
    expect(out).not.toContain('color-scheme-3" data-checkout-column="summary"');
  });

  it('no-op при пустой/undefined схеме и если панели нет', () => {
    expect(patchCheckoutBlockScheme(formPane, 'form', undefined)).toEqual(formPane);
    expect(patchCheckoutBlockScheme(formPane, 'form', '')).toEqual(formPane);
    const other = '<div class="x" data-checkout-column="other">X</div>';
    expect(patchCheckoutBlockScheme(other, 'form', 'scheme-4')).toEqual(other);
  });
});
