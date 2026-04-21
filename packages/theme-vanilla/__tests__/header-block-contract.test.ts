import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import { HeaderPuckConfig, HeaderSchema, HeaderTokens, HeaderClasses } from '../blocks/Header';

describe('Vanilla Header override', () => {
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
      siteTitle: 'Vanilla Store',
      logo: '',
      logoPosition: 'top-left',
      stickiness: 'scroll-up',
      menuType: 'dropdown',
      navigationLinks: [
        { label: 'Главная', href: '/' },
        { label: 'Каталог', href: '/catalog', submenu: [{ label: 'Новинки', href: '/catalog/new' }] },
      ],
      actionButtons: { showSearch: true, showCart: true, showProfile: true },
      colorScheme: 3,
      menuColorScheme: 3,
      padding: { top: 16, bottom: 16 },
    });
    expect(ok.success).toBe(true);
  });

  it('tokens include logo + nav-link + container-max-width', () => {
    expect(HeaderTokens).toContain('--size-logo-width');
    expect(HeaderTokens).toContain('--size-nav-link');
    expect(HeaderTokens).toContain('--container-max-width');
  });

  it('classes expose sticky variants + mobile menu + vanilla cart-badge font', () => {
    expect(HeaderClasses.sticky['scroll-up']).toBeDefined();
    expect(HeaderClasses.sticky.always).toBeDefined();
    expect(HeaderClasses.sticky.none).toBeDefined();
    expect(HeaderClasses.mobileMenu.root).toBeDefined();
    expect(HeaderClasses.mobileMenu.submenuToggle).toBeDefined();
    // Vanilla signature: Exo 2 font on cart badge + 1320px container.
    expect(HeaderClasses.cartBadge).toContain('--font-badge');
    expect(HeaderClasses.nav).toContain('max-w-[1320px]');
  });
});
