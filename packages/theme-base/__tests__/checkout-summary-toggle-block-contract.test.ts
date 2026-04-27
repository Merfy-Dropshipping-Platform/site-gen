import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CheckoutSummaryTogglePuckConfig,
  CheckoutSummaryToggleSchema,
  CheckoutSummaryToggleTokens,
  CheckoutSummaryToggleClasses,
} from '../blocks/CheckoutSummaryToggle';

describe('CheckoutSummaryToggle block', () => {
  it('conforms to validateBlock contract', async () => {
    const result = await validateBlock(path.resolve(__dirname, '../blocks/CheckoutSummaryToggle'));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports PuckConfig with responsive field', () => {
    expect(CheckoutSummaryTogglePuckConfig.label).toBe('Сводка заказа (toggle)');
    expect(CheckoutSummaryTogglePuckConfig.maxInstances).toBe(1);
    expect(CheckoutSummaryTogglePuckConfig.fields.responsive).toBeDefined();
    expect(CheckoutSummaryTogglePuckConfig.defaults.responsive.showOnMobile).toBe(true);
    expect(CheckoutSummaryTogglePuckConfig.defaults.responsive.showOnDesktop).toBe(false);
  });

  it('Schema parses defaults', () => {
    const ok = CheckoutSummaryToggleSchema.safeParse({
      headerText: 'Сводка заказа',
      dropdownIcon: 'chevron',
      responsive: { showOnMobile: true, showOnDesktop: false },
      padding: { top: 12, bottom: 12 },
    });
    expect(ok.success).toBe(true);
  });

  it('Tokens lists base vars', () => {
    expect(CheckoutSummaryToggleTokens).toContain('--color-bg');
    expect(CheckoutSummaryToggleTokens).toContain('--color-text');
  });

  it('Classes has hide variants', () => {
    expect(CheckoutSummaryToggleClasses.root).toBeDefined();
    expect(CheckoutSummaryToggleClasses.hideOnDesktop).toContain('md:hidden');
  });
});
