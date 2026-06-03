import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import { HeaderPuckConfig, HeaderSchema, HeaderTokens, HeaderClasses } from '../blocks/Header';

describe('Rose Header override', () => {
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
      siteTitle: 'Rose Shop',
      logo: '',
      logoPosition: 'top-center',
      stickiness: 'scroll-up',
      menuType: 'dropdown',
      navigationLinks: [
        { label: 'Главная', href: '/' },
        { label: 'Каталог', href: '/catalog', submenu: [{ label: 'Новинки', href: '/catalog/new' }] },
      ],
      actionButtons: { showSearch: true, showCart: true, showProfile: true },
      colorScheme: 1,
      menuColorScheme: 1,
      padding: { top: 16, bottom: 16 },
    });
    expect(ok.success).toBe(true);
  });

  it('tokens include logo + nav-link + container-max-width', () => {
    expect(HeaderTokens).toContain('--size-logo-width');
    expect(HeaderTokens).toContain('--size-nav-link');
    expect(HeaderTokens).toContain('--container-max-width');
  });

  it('classes expose sticky variants + mobile menu', () => {
    expect(HeaderClasses.sticky['scroll-up']).toBeDefined();
    expect(HeaderClasses.sticky.always).toBeDefined();
    expect(HeaderClasses.sticky.none).toBeDefined();
    expect(HeaderClasses.mobileMenu.root).toBeDefined();
    expect(HeaderClasses.mobileMenu.submenuToggle).toBeDefined();
  });
});
