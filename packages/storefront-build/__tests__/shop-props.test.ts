import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/inputs';
import { EMPTY_SHOP, shopPropsOf } from '../src/shop-props';

// Данные магазина для секций с "uses": ["shop"] (блок 1 «Секций и SDK», часть 4, Р1-4-6): как у подвала пяти тем.
const AT = '2026-10-22T09:00:00.000Z';
const entity = (type: Entity['type'], id: string, data: Entity['data']): Entity => ({ type, id, updatedAt: AT, data });

describe('данные магазина для секций', () => {
  it('контакты: почта и телефон — по значению или подписи, остальное — полями по порядку; пустое и не строка — нет', () => {
    const contacts = entity('contacts', 'main', {
      fields: [
        { id: 'a', label: 'Адрес', value: 'Москва, Тверская, 1', order: 3 },
        { id: 'p', label: 'Телефон', value: ' +7 999 000-00-00 ', order: 1 },
        { id: 'e', label: 'Почта', value: 'hi@scarves.ru', order: 2 },
        { id: 'h', label: 'Часы', value: '   ', order: 0 },
        { id: 'x', label: 'Сломанное', value: 42, order: 4 },
      ],
    });
    expect(shopPropsOf('Шарфы', [contacts]).contacts).toEqual({
      phone: '+7 999 000-00-00',
      email: 'hi@scarves.ru',
      fields: [{ label: 'Адрес', value: 'Москва, Тверская, 1' }],
    });
  });

  it('политики — только с текстом, адрес /legal/<адрес>, порядок постоянный', () => {
    const policies = [
      entity('policy', 'tos', { content: 'Условия' }),
      entity('policy', 'privacy', { content: '  ' }),
      entity('policy', 'refund', { content: 'Возврат за 14 дней' }),
    ];
    expect(shopPropsOf('Шарфы', policies).policies).toEqual([
      { type: 'refund', title: 'Политика возврата', url: '/legal/refund' },
      { type: 'tos', title: 'Условия обслуживания', url: '/legal/terms' },
    ]);
  });

  // Подпись под подвалом — site.settings.themeBrandName, как у пяти тем (footer-data.ts): своя — как вписана, пусто и
  // стандартные тексты платформы (любой регистр) — «не вписана».
  it.each([
    ['своя подпись — без пробелов по краям', '  Сделано в ООО «Ромашка» ', 'Сделано в ООО «Ромашка»'],
    ['пусто', '', ''],
    ['одни пробелы', '   ', ''],
    ['Разработано на Merfy', 'Разработано на Merfy', ''],
    ['powered by merfy в другом регистре', ' POWERED BY Merfy ', ''],
    ['стандартный текст с добавкой — уже своя', 'Разработано на Merfy и мной', 'Разработано на Merfy и мной'],
  ])('подпись: %s', (_title, raw, expected) => {
    expect(shopPropsOf('Шарфы', [], null, raw).signature).toBe(expected);
  });

  it('оплата онлайн — по сущности billing; нет данных — пустой магазин с именем', () => {
    expect(shopPropsOf('Шарфы', [entity('billing', 'main', { online: true })]).payments).toEqual({ online: true });
    expect(shopPropsOf('Шарфы', [entity('billing', 'main', { provider: 'robokassa' })]).payments).toEqual({
      online: false,
    });
    expect(shopPropsOf('Шарфы', [])).toEqual({ ...EMPTY_SHOP, name: 'Шарфы' });
  });
});
