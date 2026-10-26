import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CheckoutPaymentPuckConfig,
  CheckoutPaymentSchema,
} from '../blocks/CheckoutPayment';
import {
  DEFAULT_PAYMENT_METHODS,
  PAYMENT_METHOD_CATALOG,
  PAYMENT_METHODS_AVAILABILITY_SOURCE,
  PAYMENT_METHOD_KEYS,
  PAYMENT_METHOD_OPTIONS,
} from '../runtime/payment-methods';

const read = (rel: string): string =>
  readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');

describe('каталог способов оплаты — единственный список ключей в site-gen', () => {
  it('ключи совпадают с контрактом billing (копия образца payment-methods.json)', () => {
    const sample = JSON.parse(
      readFileSync(path.join(__dirname, 'fixtures', 'payment-methods.json'), 'utf-8'),
    );
    expect([...PAYMENT_METHOD_KEYS]).toEqual(sample);
  });

  it('у каждого ключа есть подписи; значения для списка выбора и по умолчанию из каталога', () => {
    for (const key of PAYMENT_METHOD_KEYS) {
      expect(PAYMENT_METHOD_CATALOG[key].selectLabel).not.toBe('');
      expect(PAYMENT_METHOD_CATALOG[key].label).not.toBe('');
    }
    expect(PAYMENT_METHOD_OPTIONS.map((o) => o.value)).toEqual([...PAYMENT_METHOD_KEYS]);
    expect(DEFAULT_PAYMENT_METHODS.map((m) => m.key)).toEqual([...PAYMENT_METHOD_KEYS]);
  });

  it('блок и схема берут способы из каталога, а не из своей копии', () => {
    const { fields, defaults } = CheckoutPaymentPuckConfig;
    expect((fields.methods as any).itemFields.key.options).toBe(PAYMENT_METHOD_OPTIONS);
    expect(defaults.methods).toBe(DEFAULT_PAYMENT_METHODS);
    for (const key of PAYMENT_METHOD_KEYS) {
      const ok = CheckoutPaymentSchema.safeParse({
        heading: 'X',
        subheading: 'Y',
        methods: [{ key, enabled: true, label: 'L' }],
        padding: { top: 0, bottom: 0 },
      });
      expect(ok.success).toBe(true);
    }
  });

  it('поля способов объявляют источник доступности — конструктор помечает способы, которых нет у платёжки', () => {
    const { fields } = CheckoutPaymentPuckConfig;
    const methods = fields.methods as any;
    expect(PAYMENT_METHODS_AVAILABILITY_SOURCE).toBe('shop.paymentMethods');
    expect(methods.availability).toEqual({
      source: PAYMENT_METHODS_AVAILABILITY_SOURCE,
      itemKey: 'key',
    });
    expect(methods.itemFields.key.availability).toBe(PAYMENT_METHODS_AVAILABILITY_SOURCE);
    // itemKey указывает на поле, чьи значения — ключи каталога.
    expect(methods.itemFields[methods.availability.itemKey].options).toBe(PAYMENT_METHOD_OPTIONS);
  });

  it('по умолчанию включены все способы: решает настройка магазина и платёжка, не флаг темы', () => {
    expect(DEFAULT_PAYMENT_METHODS.every((m) => m.enabled)).toBe(true);
  });

  it('в мега-блоке «Оформление заказа» нет своего списка способов и флагов enabled', () => {
    const form = read('blocks/CheckoutForm/CheckoutForm.astro');
    expect(form).toContain('methods={DEFAULT_PAYMENT_METHODS}');
    for (const key of PAYMENT_METHOD_KEYS) {
      expect(form).not.toContain(`key: '${key}'`);
    }
    expect(form).not.toMatch(/enabled:\s*false/);
  });
});
