import fs from 'node:fs/promises';
import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CheckoutSectionPuckConfig,
  CheckoutSectionSchema,
  CheckoutSectionTokens,
  CheckoutSectionClasses,
} from '../blocks/CheckoutSection';

describe('CheckoutSection block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/CheckoutSection');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports CheckoutSectionPuckConfig with required fields', () => {
    expect(CheckoutSectionPuckConfig.label).toBe('Оформление заказа');
    expect(CheckoutSectionPuckConfig.category).toBe('form');
    expect(CheckoutSectionPuckConfig.defaults.colorScheme).toBe(1);
    expect(CheckoutSectionPuckConfig.defaults.padding).toEqual({ top: 80, bottom: 80 });
    expect(CheckoutSectionPuckConfig.maxInstances).toBe(1);
  });

  it('CheckoutSectionSchema requires padding (not optional)', () => {
    // padding present → OK
    expect(
      CheckoutSectionSchema.safeParse({
        colorScheme: 1,
        padding: { top: 40, bottom: 40 },
      }).success,
    ).toBe(true);
    // padding missing → rejected
    expect(
      CheckoutSectionSchema.safeParse({
        colorScheme: 1,
      }).success,
    ).toBe(false);
  });

  it('CheckoutSectionTokens lists button + input/field radii', () => {
    expect(CheckoutSectionTokens.length).toBeGreaterThan(0);
    expect(CheckoutSectionTokens).toContain('--color-button-bg');
    expect(CheckoutSectionTokens).toContain('--radius-button');
    expect(CheckoutSectionTokens).toContain('--radius-input');
    expect(CheckoutSectionTokens).toContain('--radius-field');
    expect(CheckoutSectionTokens).toContain('--size-hero-button-h');
  });

  it('CheckoutSectionClasses has root + container + form + fieldset + totals + submit', () => {
    expect(CheckoutSectionClasses.root).toBeDefined();
    expect(CheckoutSectionClasses.container).toBeDefined();
    expect(CheckoutSectionClasses.form).toBeDefined();
    expect(CheckoutSectionClasses.fieldset).toBeDefined();
    expect(CheckoutSectionClasses.legend).toBeDefined();
    expect(CheckoutSectionClasses.totals).toBeDefined();
    expect(CheckoutSectionClasses.submit).toBeDefined();
  });

  it('CheckoutSection astro renders heading + 3 fieldsets (Контакты / Доставка / Оплата)', async () => {
    const astroPath = path.resolve(
      __dirname,
      '../blocks/CheckoutSection/CheckoutSection.astro',
    );
    const source = await fs.readFile(astroPath, 'utf-8');
    expect(source).toMatch(/<h1[^>]*>Оформление заказа<\/h1>/);
    expect(source).toMatch(/Контакты/);
    expect(source).toMatch(/Доставка/);
    expect(source).toMatch(/Оплата/);
    expect(source).toMatch(/<form[^>]*data-checkout-form/);
  });
});
