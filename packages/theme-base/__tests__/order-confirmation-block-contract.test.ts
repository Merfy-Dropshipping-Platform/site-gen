import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  OrderConfirmationPuckConfig,
  OrderConfirmationSchema,
  OrderConfirmationTokens,
  OrderConfirmationClasses,
} from '../blocks/OrderConfirmation';

describe('OrderConfirmation block', () => {
  it('conforms to validateBlock contract (no hex, no .tsx, required files)', async () => {
    const dir = path.resolve(__dirname, '../blocks/OrderConfirmation');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports OrderConfirmationPuckConfig with required fields', () => {
    expect(OrderConfirmationPuckConfig.label).toBe('Спасибо за заказ');
    expect(OrderConfirmationPuckConfig.category).toBe('form');
    expect(OrderConfirmationPuckConfig.maxInstances).toBe(1);
    expect(OrderConfirmationPuckConfig.defaults.greetingTemplate).toContain('{name}');
  });

  it('OrderConfirmationSchema parses a valid props object', () => {
    const ok = OrderConfirmationSchema.safeParse({
      banner: { enabled: true, src: 'https://x.test/a.jpg', placement: 'order', align: 'center', width: 580 },
      orderBg: '',
      summaryBg: '#fbfbfb',
      accentColor: '#000000',
      buttonColor: '#000000',
      errorColor: '#ff5555',
      headingFont: '',
      headingWeight: '',
      bodyFont: '',
      bodyWeight: '',
      greetingTemplate: 'Спасибо за заказ, {name}!',
      confirmedTitle: 'Ваш заказ подтверждён',
      confirmedNote: 'Письмо придёт.',
      detailsTitle: 'Детали заказа',
      helpText: 'Нужна помощь?',
      returnButtonText: 'Вернуться к магазину',
      returnButtonHref: '/',
      legalText: 'Соглашение',
      colorScheme: 'scheme-2',
      padding: { top: 0, bottom: 0 },
    });
    expect(ok.success).toBe(true);
  });

  it('OrderConfirmationSchema rejects out-of-range banner width', () => {
    const bad = OrderConfirmationSchema.safeParse({
      banner: { enabled: true, src: '', placement: 'full', align: 'left', width: 99999 },
      orderBg: '', summaryBg: '', accentColor: '', buttonColor: '', errorColor: '',
      headingFont: '', headingWeight: '', bodyFont: '', bodyWeight: '',
      greetingTemplate: '', confirmedTitle: '', confirmedNote: '', detailsTitle: '',
      helpText: '', returnButtonText: '', returnButtonHref: '/', legalText: '',
      colorScheme: '', padding: { top: 0, bottom: 0 },
    });
    expect(bad.success).toBe(false);
  });

  it('OrderConfirmationTokens lists block-scoped --oc-* overrides', () => {
    expect(OrderConfirmationTokens.length).toBeGreaterThan(0);
    expect(OrderConfirmationTokens).toEqual(expect.arrayContaining(['--oc-accent', '--oc-summary-bg']));
  });

  it('OrderConfirmationClasses exports both columns', () => {
    expect(typeof OrderConfirmationClasses.orderCol).toBe('string');
    expect(typeof OrderConfirmationClasses.summaryCol).toBe('string');
    expect(typeof OrderConfirmationClasses.items).toBe('string');
  });
});
