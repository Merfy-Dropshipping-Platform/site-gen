import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import { FooterPuckConfig, FooterSchema, FooterTokens, FooterClasses } from '../blocks/Footer';

describe('Vanilla Footer override', () => {
  it('conforms to validateBlock (5 files, no hex/rgb/hsl, no .tsx)', async () => {
    const dir = path.resolve(__dirname, '../blocks/Footer');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('is singleton (maxInstances: 1)', () => {
    expect(FooterPuckConfig.maxInstances).toBe(1);
  });

  it('category is navigation', () => {
    expect(FooterPuckConfig.category).toBe('navigation');
  });

  it('schema parses valid props identical to base Footer shape', () => {
    const ok = FooterSchema.safeParse({
      newsletter: {
        enabled: true,
        heading: 'Подпишитесь',
        description: 'Получайте новости.',
        placeholder: 'email@example.ru',
      },
      heading: { text: '', size: 'small', alignment: 'center' },
      text: { content: '', size: 'small' },
      navigationColumn: { title: 'Nav', links: [{ label: 'A', href: '/' }] },
      informationColumn: { title: 'Info', links: [{ label: 'B', href: '/b' }] },
      socialColumn: {
        title: 'Social',
        email: 'info@vanilla.ru',
        socialLinks: [{ platform: 'telegram', href: '#' }],
      },
      colorScheme: 3,
      copyrightColorScheme: 1,
      padding: { top: 80, bottom: 80 },
    });
    expect(ok.success).toBe(true);
  });

  it('tokens include footer-layout + container-max-width', () => {
    expect(FooterTokens).toContain('--footer-layout');
    expect(FooterTokens).toContain('--container-max-width');
    expect(FooterTokens).toContain('--font-heading');
  });

  it('classes expose vanilla signature: 1320px container + powered-by bar', () => {
    expect(FooterClasses.container).toContain('max-w-[1320px]');
    expect(FooterClasses.poweredBy.bar).toBeDefined();
    expect(FooterClasses.poweredBy.text).toBeDefined();
    expect(FooterClasses.paymentBadge).toBeDefined();
  });
});
