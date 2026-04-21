import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import { FooterPuckConfig, FooterSchema, FooterTokens, FooterClasses } from '../blocks/Footer';

describe('Footer chrome block', () => {
  it('conforms to validateBlock', async () => {
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

  it('schema parses valid props with telegram+vk social links', () => {
    const ok = FooterSchema.safeParse({
      newsletter: { enabled: true, heading: 'Sub', description: 'desc', placeholder: 'email' },
      heading: { text: '', size: 'small', alignment: 'center' },
      text: { content: '', size: 'small' },
      navigationColumn: { title: 'Nav', links: [{ label: 'Home', href: '/' }] },
      informationColumn: { title: 'Info', links: [{ label: 'About', href: '/about' }] },
      socialColumn: {
        title: 'Social',
        email: 'hello@shop.com',
        socialLinks: [
          { platform: 'telegram', href: 'https://t.me/shop' },
          { platform: 'vk', href: 'https://vk.com/shop' },
        ],
      },
      colorScheme: 1,
      copyrightColorScheme: 1,
      padding: { top: 80, bottom: 80 },
    });
    expect(ok.success).toBe(true);
  });

  it('schema rejects unknown social platform', () => {
    const bad = FooterSchema.safeParse({
      newsletter: { enabled: false, heading: '', description: '', placeholder: '' },
      heading: { text: '', size: 'small', alignment: 'center' },
      text: { content: '', size: 'small' },
      navigationColumn: { title: '', links: [] },
      informationColumn: { title: '', links: [] },
      socialColumn: {
        title: '', email: '',
        socialLinks: [{ platform: 'facebook', href: 'https://fb.com/shop' }],
      },
      colorScheme: 1,
      copyrightColorScheme: 1,
      padding: { top: 0, bottom: 0 },
    });
    expect(bad.success).toBe(false);
  });

  it('tokens include footer-layout + spacing-section-y', () => {
    expect(FooterTokens).toContain('--footer-layout');
    expect(FooterTokens).toContain('--spacing-section-y');
  });

  it('classes expose newsletter + main + copyright blocks', () => {
    expect(FooterClasses.newsletter.form).toBeDefined();
    expect(FooterClasses.main.twoPart).toBeDefined();
    expect(FooterClasses.copyright.bar).toBeDefined();
  });
});
