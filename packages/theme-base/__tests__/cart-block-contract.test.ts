import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CartBodyPuckConfig,
  CartBodySchema,
  CartBodyTokens,
  CartBodyClasses,
} from '../blocks/CartBody';
import {
  CartSummaryPuckConfig,
  CartSummarySchema,
  CartSummaryTokens,
  CartSummaryClasses,
} from '../blocks/CartSummary';

describe('CartBody block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/CartBody');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports CartBodyPuckConfig with required fields', () => {
    expect(CartBodyPuckConfig.label).toBe('Корзина');
    expect(CartBodyPuckConfig.category).toBe('content');
    expect(CartBodyPuckConfig.maxInstances).toBe(1);
    expect(CartBodyPuckConfig.defaults.padding.top).toBe(80);
  });

  it('CartBodySchema parses minimal valid props', () => {
    const ok = CartBodySchema.safeParse({
      colorScheme: 'scheme-1',
      padding: { top: 80, bottom: 40 },
    });
    expect(ok.success).toBe(true);
  });

  it('CartBodySchema rejects padding outside 0..160', () => {
    const fail = CartBodySchema.safeParse({
      colorScheme: 'scheme-1',
      padding: { top: 200, bottom: 0 },
    });
    expect(fail.success).toBe(false);
  });

  it('CartBodySchema accepts colorScheme as optional', () => {
    const ok = CartBodySchema.safeParse({ padding: { top: 0, bottom: 0 } });
    expect(ok.success).toBe(true);
  });

  it('CartBodyTokens lists at least one CSS var', () => {
    expect(CartBodyTokens.length).toBeGreaterThan(0);
    expect(CartBodyTokens[0].startsWith('--')).toBe(true);
  });

  it('CartBodyClasses exports root + heading', () => {
    expect(typeof CartBodyClasses.root).toBe('string');
    expect(typeof CartBodyClasses.heading).toBe('string');
  });
});

describe('CartSummary block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/CartSummary');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports CartSummaryPuckConfig with required fields', () => {
    expect(CartSummaryPuckConfig.label).toBe('Промежуточный итог');
    expect(CartSummaryPuckConfig.category).toBe('content');
    expect(CartSummaryPuckConfig.maxInstances).toBe(1);
    expect(CartSummaryPuckConfig.defaults.padding.bottom).toBe(80);
  });

  it('CartSummarySchema parses minimal valid props', () => {
    const ok = CartSummarySchema.safeParse({
      colorScheme: 'scheme-1',
      padding: { top: 0, bottom: 80 },
    });
    expect(ok.success).toBe(true);
  });

  it('CartSummarySchema rejects negative padding', () => {
    const fail = CartSummarySchema.safeParse({ padding: { top: -10, bottom: 80 } });
    expect(fail.success).toBe(false);
  });

  it('CartSummarySchema accepts colorScheme as optional', () => {
    const ok = CartSummarySchema.safeParse({ padding: { top: 0, bottom: 0 } });
    expect(ok.success).toBe(true);
  });

  it('CartSummaryTokens lists at least one CSS var', () => {
    expect(CartSummaryTokens.length).toBeGreaterThan(0);
    expect(CartSummaryTokens[0].startsWith('--')).toBe(true);
  });

  it('CartSummaryClasses exports root + checkoutBtn', () => {
    expect(typeof CartSummaryClasses.root).toBe('string');
    expect(typeof CartSummaryClasses.checkoutBtn).toBe('string');
  });
});
