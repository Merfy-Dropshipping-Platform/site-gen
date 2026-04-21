import path from 'node:path';
import fs from 'node:fs/promises';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  AccountLayoutPuckConfig,
  AccountLayoutSchema,
  AccountLayoutTokens,
  AccountLayoutClasses,
} from '../blocks/AccountLayout';

describe('AccountLayout chrome block', () => {
  const blockDir = path.resolve(__dirname, '../blocks/AccountLayout');

  it('conforms to validateBlock', async () => {
    const result = await validateBlock(blockDir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('is singleton (maxInstances: 1)', () => {
    expect(AccountLayoutPuckConfig.maxInstances).toBe(1);
  });

  it('category is layout', () => {
    expect(AccountLayoutPuckConfig.category).toBe('layout');
  });

  it('schema parses every activePage enum value', () => {
    const pages: Array<'dashboard' | 'orders' | 'profile' | 'settings' | 'logout'> = [
      'dashboard',
      'orders',
      'profile',
      'settings',
      'logout',
    ];
    for (const activePage of pages) {
      const result = AccountLayoutSchema.safeParse({
        showGreeting: true,
        sidebarPosition: 'left',
        activePage,
        colorScheme: 1,
        padding: { top: 48, bottom: 48 },
      });
      expect(result.success).toBe(true);
    }
  });

  it('schema parses both sidebar positions', () => {
    for (const sidebarPosition of ['left', 'right'] as const) {
      const result = AccountLayoutSchema.safeParse({
        showGreeting: true,
        sidebarPosition,
        activePage: 'dashboard',
        colorScheme: 1,
        padding: { top: 48, bottom: 48 },
      });
      expect(result.success).toBe(true);
    }
  });

  it('classes contain distinct sidebar position variants', () => {
    expect(AccountLayoutClasses.sidebar.left).toBeDefined();
    expect(AccountLayoutClasses.sidebar.right).toBeDefined();
    expect(AccountLayoutClasses.sidebar.left).not.toEqual(AccountLayoutClasses.sidebar.right);
  });

  it('astro template includes <slot /> for page content', async () => {
    const astro = await fs.readFile(path.join(blockDir, 'AccountLayout.astro'), 'utf-8');
    expect(astro).toMatch(/<slot\s*\/>/);
  });

  it('tokens include navigation + primary + error for active/logout styling', () => {
    expect(AccountLayoutTokens).toContain('--size-nav-link');
    expect(AccountLayoutTokens).toContain('--color-primary');
    expect(AccountLayoutTokens).toContain('--color-error');
    expect(AccountLayoutTokens).toContain('--container-max-width');
  });

  it('classes expose nav + logout button', () => {
    expect(AccountLayoutClasses.nav).toBeDefined();
    expect(AccountLayoutClasses.navLink).toBeDefined();
    expect(AccountLayoutClasses.logoutBtn).toBeDefined();
  });
});
