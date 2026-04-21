import path from 'node:path';
import fs from 'node:fs/promises';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CheckoutLayoutPuckConfig,
  CheckoutLayoutSchema,
  CheckoutLayoutTokens,
  CheckoutLayoutClasses,
} from '../blocks/CheckoutLayout';

describe('CheckoutLayout chrome block', () => {
  const blockDir = path.resolve(__dirname, '../blocks/CheckoutLayout');

  it('conforms to validateBlock', async () => {
    const result = await validateBlock(blockDir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('is singleton (maxInstances: 1)', () => {
    expect(CheckoutLayoutPuckConfig.maxInstances).toBe(1);
  });

  it('category is layout', () => {
    expect(CheckoutLayoutPuckConfig.category).toBe('layout');
  });

  it('schema parses minimal valid props', () => {
    const result = CheckoutLayoutSchema.safeParse({
      showOrderSummary: true,
      showTrustBadges: true,
      colorScheme: 1,
      padding: { top: 48, bottom: 48 },
    });
    expect(result.success).toBe(true);
  });

  it('astro template includes <slot /> for CheckoutSection injection', async () => {
    const astro = await fs.readFile(path.join(blockDir, 'CheckoutLayout.astro'), 'utf-8');
    expect(astro).toMatch(/<slot\s*\/>/);
  });

  it('astro template gates summary aside on showOrderSummary', async () => {
    const astro = await fs.readFile(path.join(blockDir, 'CheckoutLayout.astro'), 'utf-8');
    expect(astro).toMatch(/showOrderSummary\s*&&/);
  });

  it('astro template gates trust badges on showTrustBadges', async () => {
    const astro = await fs.readFile(path.join(blockDir, 'CheckoutLayout.astro'), 'utf-8');
    expect(astro).toMatch(/showTrustBadges\s*&&/);
  });

  it('tokens include container + surface + radius card', () => {
    expect(CheckoutLayoutTokens).toContain('--container-max-width');
    expect(CheckoutLayoutTokens).toContain('--color-surface');
    expect(CheckoutLayoutTokens).toContain('--radius-card');
  });

  it('classes expose grid + summary', () => {
    expect(CheckoutLayoutClasses.grid).toBeDefined();
    expect(CheckoutLayoutClasses.summary).toBeDefined();
    expect(CheckoutLayoutClasses.trustBadges).toBeDefined();
  });
});
