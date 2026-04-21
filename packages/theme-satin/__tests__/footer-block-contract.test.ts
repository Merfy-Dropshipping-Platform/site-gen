import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import { FooterPuckConfig, FooterSchema, FooterTokens, FooterClasses } from '../blocks/Footer';

describe('Satin Footer override', () => {
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
        heading: 'ПОДПИСАТЬСЯ',
        description: 'Получайте новости.',
        placeholder: 'email@example.ru',
      },
      heading: { text: '', size: 'small', alignment: 'center' },
      text: { content: '', size: 'small' },
      navigationColumn: { title: 'Nav', links: [{ label: 'A', href: '/' }] },
      informationColumn: { title: 'Info', links: [{ label: 'B', href: '/b' }] },
      socialColumn: {
        title: 'Social',
        email: 'info@satin.ru',
        socialLinks: [{ platform: 'telegram', href: '#' }],
      },
      colorScheme: 2,
      copyrightColorScheme: 3,
      padding: { top: 80, bottom: 80 },
    });
    expect(ok.success).toBe(true);
  });

  it('tokens include footer-layout + container-max-width + font-button', () => {
    expect(FooterTokens).toContain('--footer-layout');
    expect(FooterTokens).toContain('--container-max-width');
    expect(FooterTokens).toContain('--font-heading');
    expect(FooterTokens).toContain('--font-button');
  });

  it('classes expose satin signature: 1320px + uppercase submit + powered-by bar', () => {
    expect(FooterClasses.container).toContain('max-w-[1320px]');
    // Satin signature: uppercase tracking-0.05em on newsletter heading + submit
    expect(FooterClasses.newsletter.heading).toContain('uppercase');
    expect(FooterClasses.newsletter.heading).toContain('tracking-[0.05em]');
    expect(FooterClasses.newsletter.submit).toContain('uppercase');
    expect(FooterClasses.newsletter.submit).toContain('tracking-[0.05em]');
    expect(FooterClasses.newsletter.submit).toContain('--font-button');
    expect(FooterClasses.poweredBy.bar).toBeDefined();
  });
});
