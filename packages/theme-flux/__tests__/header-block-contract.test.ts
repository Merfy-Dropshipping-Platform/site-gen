import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import { HeaderPuckConfig, HeaderSchema, HeaderTokens, HeaderClasses } from '../blocks/Header';

describe('Flux Header override', () => {
  it('conforms to validateBlock (5 files, no hex/rgb/hsl, no .tsx)', async () => {
    const dir = path.resolve(__dirname, '../blocks/Header');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('is singleton (maxInstances: 1)', () => {
    expect(HeaderPuckConfig.maxInstances).toBe(1);
  });

  it('category is navigation', () => {
    expect(HeaderPuckConfig.category).toBe('navigation');
  });

  it('schema parses valid props identical to base Header shape', () => {
    const ok = HeaderSchema.safeParse({
      siteTitle: 'Flux Store',
      logo: '',
      logoPosition: 'top-left',
      stickiness: 'scroll-up',
      menuType: 'dropdown',
      navigationLinks: [
        { label: 'Главная', href: '/' },
        { label: 'Каталог', href: '/catalog', submenu: [{ label: 'Новинки', href: '/catalog/new' }] },
      ],
      actionButtons: { showSearch: true, showCart: true, showProfile: true },
      colorScheme: 2,
      menuColorScheme: 2,
      padding: { top: 20, bottom: 20 },
    });
    expect(ok.success).toBe(true);
  });

  it('tokens include logo + nav-link + container + radius-button', () => {
    expect(HeaderTokens).toContain('--size-logo-width');
    expect(HeaderTokens).toContain('--size-nav-link');
    expect(HeaderTokens).toContain('--container-max-width');
    expect(HeaderTokens).toContain('--radius-button');
  });

  it('classes expose flux signature: 1320px container + orange cart-badge + bold heading', () => {
    expect(HeaderClasses.sticky['scroll-up']).toBeDefined();
    expect(HeaderClasses.mobileMenu.submenuToggle).toBeDefined();
    expect(HeaderClasses.nav).toContain('max-w-[1320px]');
    // Flux signature: orange accent cart badge + small 2px radius
    expect(HeaderClasses.cartBadge).toContain('--color-accent');
    expect(HeaderClasses.cartBadge).toContain('rounded-[2px]');
    expect(HeaderClasses.logoText).toContain('font-bold');
    expect(HeaderClasses.logoText).toContain('--font-heading');
  });
});
