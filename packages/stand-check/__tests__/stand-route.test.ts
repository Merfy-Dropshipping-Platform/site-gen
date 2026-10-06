import { describe, expect, it, vi } from 'vitest';
import { standRoute, withoutStand } from '../src/astro/stand-route.mjs';

const THEME_ROOT = new URL('file:///repo/themes/nova/');

function injectedRoutes(enabled: boolean) {
  const injectRoute = vi.fn<(route: { pattern: string; entrypoint: URL }) => void>();
  standRoute({ enabled }).hooks['astro:config:setup']({ config: { root: THEME_ROOT }, injectRoute });
  return injectRoute.mock.calls;
}

describe('standRoute', () => {
  it('с флагом добавляет /theme-stand — страницу src/stand/StandPage.astro самой темы', () => {
    const page = new URL('file:///repo/themes/nova/src/stand/StandPage.astro');
    expect(injectedRoutes(true)).toEqual([[{ pattern: '/theme-stand', entrypoint: page }]]);
  });

  it('без флага адреса нет', () => {
    expect(injectedRoutes(false)).toEqual([]);
  });
});

describe('withoutStand', () => {
  it('выкидывает стенд из карты сайта — со слешем в конце и без', () => {
    expect(withoutStand('https://example.com/theme-stand/')).toBe(false);
    expect(withoutStand('https://example.com/theme-stand')).toBe(false);
  });

  it('остальные страницы оставляет, даже с похожим адресом', () => {
    expect(withoutStand('https://example.com/')).toBe(true);
    expect(withoutStand('https://example.com/theme-standard/')).toBe(true);
  });
});
