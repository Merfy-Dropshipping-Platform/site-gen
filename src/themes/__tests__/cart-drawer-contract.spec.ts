import { resolveCartDrawerGlobals, CART_DRAWER_DISCLAIMER } from '../cart-drawer-contract';

// F-052 / F-054: PreviewController and live BuildService independently
// duplicated this exact algorithm. This shared resolver must preserve it
// byte-for-byte; both call sites have parity tests (below + in
// preview-page-routing.spec / build.service specs).
//
// Rules:
//   - scheme: valid `scheme-\d+` from CartBody, else CartSummary
//   - a valid scheme adds the COUPLED pair SCHEME + fixed DISCLAIMER
//   - TITLE/CHECKOUT/EMPTY added INDEPENDENTLY only for non-empty trimmed
//     theme-setting strings
//   - result contains 0..5 exact `__MERFY_CART_DRAWER_*__` globals

function withCart(content: unknown, themeSettings?: unknown) {
  return { pagesData: { 'page-cart': { content } }, themeSettings };
}

describe('resolveCartDrawerGlobals', () => {
  it('returns 0 globals for absent revision data', () => {
    expect(resolveCartDrawerGlobals(null)).toEqual({});
    expect(resolveCartDrawerGlobals(undefined)).toEqual({});
    expect(resolveCartDrawerGlobals({})).toEqual({});
  });

  it('returns 0 globals when page-cart has no valid scheme and no texts', () => {
    expect(
      resolveCartDrawerGlobals(withCart([{ type: 'CartBody', props: {} }])),
    ).toEqual({});
  });

  it('valid CartBody scheme yields the coupled SCHEME + DISCLAIMER pair (2 globals)', () => {
    const g = resolveCartDrawerGlobals(
      withCart([{ type: 'CartBody', props: { colorScheme: 'scheme-3' } }]),
    );
    expect(g).toEqual({
      __MERFY_CART_DRAWER_SCHEME__: 'scheme-3',
      __MERFY_CART_DRAWER_DISCLAIMER__: CART_DRAWER_DISCLAIMER,
    });
  });

  it('CartBody scheme wins over CartSummary scheme', () => {
    const g = resolveCartDrawerGlobals(
      withCart([
        { type: 'CartSummary', props: { colorScheme: 'scheme-9' } },
        { type: 'CartBody', props: { colorScheme: 'scheme-2' } },
      ]),
    );
    expect(g.__MERFY_CART_DRAWER_SCHEME__).toBe('scheme-2');
  });

  it('falls back to CartSummary scheme when CartBody has none', () => {
    const g = resolveCartDrawerGlobals(
      withCart([
        { type: 'CartBody', props: {} },
        { type: 'CartSummary', props: { colorScheme: 'scheme-5' } },
      ]),
    );
    expect(g.__MERFY_CART_DRAWER_SCHEME__).toBe('scheme-5');
  });

  it('invalid scheme string is ignored (no SCHEME/DISCLAIMER)', () => {
    const g = resolveCartDrawerGlobals(
      withCart([{ type: 'CartBody', props: { colorScheme: 'blue' } }]),
    );
    expect(g).toEqual({});
    const g2 = resolveCartDrawerGlobals(
      withCart([{ type: 'CartBody', props: { colorScheme: 'scheme-' } }]),
    );
    expect(g2).toEqual({});
  });

  it('non-string scheme value is ignored', () => {
    const g = resolveCartDrawerGlobals(
      withCart([{ type: 'CartBody', props: { colorScheme: 3 } }]),
    );
    expect(g).toEqual({});
  });

  it('adds TITLE/CHECKOUT/EMPTY independently from trimmed theme settings only', () => {
    const g = resolveCartDrawerGlobals(
      withCart([{ type: 'CartBody', props: {} }], {
        cartDrawerTitle: '  Моя корзина  ',
        cartDrawerCheckoutText: 'Оформить',
        cartDrawerEmptyText: '   ',
      }),
    );
    // title trimmed, checkout kept, empty (whitespace-only) dropped. No scheme.
    expect(g).toEqual({
      __MERFY_CART_DRAWER_TITLE__: 'Моя корзина',
      __MERFY_CART_DRAWER_CHECKOUT__: 'Оформить',
    });
  });

  it('full: valid scheme + all three texts = exactly 5 globals', () => {
    const g = resolveCartDrawerGlobals(
      withCart([{ type: 'CartBody', props: { colorScheme: 'scheme-1' } }], {
        cartDrawerTitle: 'Корзина',
        cartDrawerCheckoutText: 'Купить',
        cartDrawerEmptyText: 'Пусто',
      }),
    );
    expect(g).toEqual({
      __MERFY_CART_DRAWER_SCHEME__: 'scheme-1',
      __MERFY_CART_DRAWER_DISCLAIMER__: CART_DRAWER_DISCLAIMER,
      __MERFY_CART_DRAWER_TITLE__: 'Корзина',
      __MERFY_CART_DRAWER_CHECKOUT__: 'Купить',
      __MERFY_CART_DRAWER_EMPTY__: 'Пусто',
    });
    expect(Object.keys(g)).toHaveLength(5);
  });

  it('empty-string texts are dropped (independent of scheme)', () => {
    const g = resolveCartDrawerGlobals(
      withCart([{ type: 'CartBody', props: { colorScheme: 'scheme-1' } }], {
        cartDrawerTitle: '',
        cartDrawerCheckoutText: '',
        cartDrawerEmptyText: '',
      }),
    );
    expect(g).toEqual({
      __MERFY_CART_DRAWER_SCHEME__: 'scheme-1',
      __MERFY_CART_DRAWER_DISCLAIMER__: CART_DRAWER_DISCLAIMER,
    });
  });

  it('DISCLAIMER constant is the exact fixed Russian string', () => {
    expect(CART_DRAWER_DISCLAIMER).toBe(
      'Налоги, скидки и стоимость доставки рассчитываются при оформлении заказа.',
    );
  });
});
