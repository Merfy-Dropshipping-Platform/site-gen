import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import { FooterPuckConfig, FooterSchema, FooterTokens, FooterClasses } from '../blocks/Footer';

describe('Rose Footer override', () => {
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
      newsletter: { enabled: true, heading: 'Sub', description: 'desc', placeholder: 'email' },
      heading: { text: 'Hi', size: 'small', alignment: 'center' },
      text: { content: 'body', size: 'small' },
      navigationColumn: { title: 'Nav', links: [{ label: 'Home', href: '/' }] },
      informationColumn: { title: 'Info', links: [{ label: 'About', href: '/about' }] },
      socialColumn: {
        title: 'Social',
        email: 'hello@rose.com',
        socialLinks: [
          { platform: 'telegram', href: 'https://t.me/rose' },
          { platform: 'vk', href: 'https://vk.com/rose' },
        ],
      },
      colorScheme: 1,
      copyrightColorScheme: 1,
      padding: { top: 80, bottom: 80 },
    });
    expect(ok.success).toBe(true);
  });

  it('schema rejects unknown social platform (keeps whitelist parity with base)', () => {
    const bad = FooterSchema.safeParse({
      newsletter: { enabled: false, heading: '', description: '', placeholder: '' },
      heading: { text: '', size: 'small', alignment: 'center' },
      text: { content: '', size: 'small' },
      navigationColumn: { title: '', links: [] },
      informationColumn: { title: '', links: [] },
      socialColumn: {
        title: '', email: '',
        socialLinks: [{ platform: 'facebook', href: 'https://fb.com/rose' }],
      },
      colorScheme: 1,
      copyrightColorScheme: 1,
      padding: { top: 0, bottom: 0 },
    });
    expect(bad.success).toBe(false);
  });

  it('tokens include footer-layout + spacing-section-y + radius-input', () => {
    expect(FooterTokens).toContain('--footer-layout');
    expect(FooterTokens).toContain('--spacing-section-y');
    expect(FooterTokens).toContain('--radius-input');
  });

  it('classes expose newsletter + 3-column grid + column + copyright', () => {
    expect(FooterClasses.newsletter.form).toBeDefined();
    expect(FooterClasses.main.grid).toBeDefined();
    expect(FooterClasses.column.title).toBeDefined();
    expect(FooterClasses.column.nav).toBeDefined();
    expect(FooterClasses.copyright.bar).toBeDefined();
  });
});
