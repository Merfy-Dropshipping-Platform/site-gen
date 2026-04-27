import path from 'node:path';
import fs from 'node:fs/promises';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CheckoutLayoutPuckConfig,
  CheckoutLayoutSchema,
  CheckoutLayoutTokens,
  CheckoutLayoutClasses,
} from '../blocks/CheckoutLayout';

describe('CheckoutLayout block', () => {
  const blockDir = path.resolve(__dirname, '../blocks/CheckoutLayout');

  it('conforms to validateBlock contract', async () => {
    const result = await validateBlock(blockDir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports PuckConfig with two-column fields', () => {
    expect(CheckoutLayoutPuckConfig.label).toBe('Чекаут (контейнер)');
    expect(CheckoutLayoutPuckConfig.category).toBe('layout');
    expect(CheckoutLayoutPuckConfig.maxInstances).toBe(1);
    expect(CheckoutLayoutPuckConfig.fields.summaryPosition).toBeDefined();
    expect(CheckoutLayoutPuckConfig.fields.formColumnWidth).toBeDefined();
    expect(CheckoutLayoutPuckConfig.fields.summaryColumnWidth).toBeDefined();
    expect(CheckoutLayoutPuckConfig.fields.gap).toBeDefined();
    expect(CheckoutLayoutPuckConfig.fields.breakpoint).toBeDefined();
  });

  it('Schema parses defaults', () => {
    const ok = CheckoutLayoutSchema.safeParse({
      summaryPosition: 'right',
      formColumnWidth: 652,
      summaryColumnWidth: 884,
      gap: 64,
      breakpoint: 768,
      padding: { top: 80, bottom: 80 },
    });
    expect(ok.success).toBe(true);
  });

  it('Schema rejects invalid summaryPosition', () => {
    const fail = CheckoutLayoutSchema.safeParse({
      summaryPosition: 'left',
      formColumnWidth: 652,
      summaryColumnWidth: 884,
      gap: 64,
      breakpoint: 768,
      padding: { top: 0, bottom: 0 },
    });
    expect(fail.success).toBe(false);
  });

  it('Tokens whitelist column-width vars', () => {
    expect(CheckoutLayoutTokens).toContain('--color-bg');
    expect(CheckoutLayoutTokens).toContain('--checkout-form-col-w');
    expect(CheckoutLayoutTokens).toContain('--checkout-summary-col-w');
    expect(CheckoutLayoutTokens).toContain('--checkout-gap');
  });

  it('Classes has form/summary/grid keys', () => {
    expect(CheckoutLayoutClasses.root).toBeDefined();
    expect(CheckoutLayoutClasses.gridContainer).toBeDefined();
    expect(CheckoutLayoutClasses.formColumn).toBeDefined();
    expect(CheckoutLayoutClasses.summaryColumn).toBeDefined();
  });

  it('astro template emits two named slots (form / summary)', async () => {
    const astro = await fs.readFile(path.join(blockDir, 'CheckoutLayout.astro'), 'utf-8');
    expect(astro).toMatch(/<slot\s+name="form"\s*\/>/);
    expect(astro).toMatch(/<slot\s+name="summary"\s*\/>/);
  });
});
