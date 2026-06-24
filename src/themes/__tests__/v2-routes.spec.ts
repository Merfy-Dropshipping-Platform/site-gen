import { isV2ComplexRoute } from '../v2-routes';

/**
 * 098 wiring: catalog / collection / collections СНЯТЫ из замка сложных
 * маршрутов, чтобы каталог и страницы коллекций нарезались на секции в превью
 * (выделяемы + hot-replace), а не отдавались пред-собранным блобом.
 * Регресс-гард: эти три первых сегмента теперь контентные (false), а
 * настоящие сложные маршруты (product/cart/checkout) остаются заблокированы.
 */
describe('isV2ComplexRoute — замок сложных маршрутов', () => {
  it('каталог и коллекции БОЛЬШЕ не сложные (нарезаются на секции)', () => {
    expect(isV2ComplexRoute('catalog')).toBe(false);
    expect(isV2ComplexRoute('collections/preview')).toBe(false);
    expect(isV2ComplexRoute('collections/winter-2026')).toBe(false);
    // одиночный сегмент collection (legacy slug) тоже снят
    expect(isV2ComplexRoute('collection')).toBe(false);
  });

  it('пустой маршрут (home) — контентный', () => {
    expect(isV2ComplexRoute('')).toBe(false);
  });

  it('настоящие сложные маршруты остаются заблокированы', () => {
    expect(isV2ComplexRoute('product')).toBe(true);
    expect(isV2ComplexRoute('products')).toBe(true);
    expect(isV2ComplexRoute('cart')).toBe(true);
    expect(isV2ComplexRoute('checkout')).toBe(true);
    expect(isV2ComplexRoute('auth')).toBe(true);
    expect(isV2ComplexRoute('account')).toBe(true);
  });

  it('решение принимается по первому сегменту маршрута', () => {
    expect(isV2ComplexRoute('checkout/success')).toBe(true);
    expect(isV2ComplexRoute('products/prod-123')).toBe(true);
  });

  // Spec 108: V2_COMPLEX_ROUTE_PREFIXES удалён (источник — реестр). Состав
  // замка проверяем через публичный isV2ComplexRoute (= isVerbatimRoute):
  // для одиночного сегмента .has(x) ≡ isV2ComplexRoute(x) — поведение то же.
  it('набор замка не содержит каталога/коллекций, но содержит сложные', () => {
    expect(isV2ComplexRoute('catalog')).toBe(false);
    expect(isV2ComplexRoute('collection')).toBe(false);
    expect(isV2ComplexRoute('collections')).toBe(false);
    expect(isV2ComplexRoute('product')).toBe(true);
    expect(isV2ComplexRoute('checkout')).toBe(true);
  });
});
