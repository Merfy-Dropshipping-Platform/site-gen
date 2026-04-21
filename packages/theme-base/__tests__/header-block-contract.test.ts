import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import { HeaderPuckConfig, HeaderSchema, HeaderTokens, HeaderClasses } from '../blocks/Header';

describe('Header chrome block', () => {
  it('conforms to validateBlock', async () => {
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

  it('schema parses valid props', () => {
    const ok = HeaderSchema.safeParse({
      siteTitle: 'Test',
      logo: '',
      logoPosition: 'top-left',
      stickiness: 'scroll-up',
      menuType: 'dropdown',
      navigationLinks: [{ label: 'Home', href: '/' }],
      actionButtons: { showSearch: true, showCart: true, showProfile: true },
      colorScheme: 1,
      menuColorScheme: 1,
      padding: { top: 16, bottom: 16 },
    });
    expect(ok.success).toBe(true);
  });

  it('tokens include logo + nav link sizes', () => {
    expect(HeaderTokens).toContain('--size-logo-width');
    expect(HeaderTokens).toContain('--size-nav-link');
  });

  it('classes include sticky variants', () => {
    expect(HeaderClasses.sticky['scroll-up']).toBeDefined();
    expect(HeaderClasses.sticky.always).toBeDefined();
  });
});
