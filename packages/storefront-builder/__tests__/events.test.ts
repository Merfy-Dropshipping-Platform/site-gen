import { describe, expect, it } from 'vitest';
import { StorefrontBuilderError, errorText } from '../src/errors';
import {
  CONTENT_EXCHANGE,
  MAX_PRIORITY,
  PRODUCT_EXCHANGE,
  contentEventBody,
  jobBody,
  parseIncoming,
  parseJob,
  priorityOf,
} from '../src/events';

// События и задания — без брокера: разбор сообщений обеих точек обмена, приоритеты, ошибки с путём поля.
const SITE = '0b8f3c1e-2d4a-4b6c-8e9f-0a1b2c3d4e5f';
const AT = '2026-10-08T09:00:00.000Z';
const RECEIVED = '2026-10-08T09:00:05.000Z';

function failure(run: () => unknown): StorefrontBuilderError {
  try {
    run();
  } catch (error) {
    if (error instanceof StorefrontBuilderError) return error;
    throw error;
  }
  throw new Error('ожидали ошибку');
}

describe('приоритет задания', () => {
  it('публикация › правка › выпуск темы; неизвестное событие — правка', () => {
    expect(priorityOf('merchant-publish')).toBe(3);
    expect(priorityOf('shop-name-change')).toBe(2);
    expect(priorityOf('theme-release')).toBe(1);
    expect(priorityOf('something-new')).toBe(2);
    expect(MAX_PRIORITY).toBe(3);
  });
});

describe('событие content.events', () => {
  it('разобрано в событие сайта; обратно — тело с версией формата', () => {
    const body = contentEventBody({ type: 'shop-name-change', siteId: SITE, eventAt: AT, source: 'sites' });
    expect(body).toEqual({ v: 1, type: 'shop-name-change', siteId: SITE, eventAt: AT, source: 'sites' });
    const event = parseIncoming(CONTENT_EXCHANGE, body, RECEIVED);
    expect(event).toEqual({ owner: 'site', siteId: SITE, type: 'shop-name-change', eventAt: AT });
  });

  it('неизвестная точка обмена — разбирается как content.events', () => {
    const body = contentEventBody({ type: 'restart', siteId: SITE, eventAt: AT, source: 'pnpm shop' });
    expect(parseIncoming('', body, RECEIVED)).toMatchObject({ owner: 'site', type: 'restart' });
  });

  it('лишнее поле, чужая версия, кривой тип — message-invalid с путём поля', () => {
    const body = contentEventBody({ type: 'shop-name-change', siteId: SITE, eventAt: AT, source: 'sites' });
    const extra = failure(() => parseIncoming(CONTENT_EXCHANGE, { ...body, tenantId: 'x' }, RECEIVED));
    expect(extra.code).toBe('message-invalid');
    expect(extra.path).toBe('content.events#tenantId');
    expect(failure(() => parseIncoming(CONTENT_EXCHANGE, { ...body, v: 2 }, RECEIVED)).path).toBe('content.events#v');
    const badType = failure(() => parseIncoming(CONTENT_EXCHANGE, { ...body, type: 'Shop Name' }, RECEIVED));
    expect(badType.message).toMatch(/^content\.events#type: /);
  });
});

describe('событие product.events', () => {
  it('событие организации «product-change»; время — из timestamp, иначе время получения', () => {
    const body = { event: 'product.updated', tenantId: 'org-1', productIds: ['p1'], timestamp: AT };
    expect(parseIncoming(PRODUCT_EXCHANGE, body, RECEIVED)).toEqual({
      owner: 'tenant',
      tenantId: 'org-1',
      type: 'product-change',
      eventAt: AT,
    });
    const noTime = parseIncoming(PRODUCT_EXCHANGE, { event: 'product.deleted', tenantId: 'org-1' }, RECEIVED);
    expect(noTime.eventAt).toBe(RECEIVED);
  });

  it('без tenantId — message-invalid', () => {
    const error = failure(() => parseIncoming(PRODUCT_EXCHANGE, { event: 'product.updated' }, RECEIVED));
    expect(error.code).toBe('message-invalid');
    expect(error.path).toBe('product.events#tenantId');
  });
});

describe('задание сборки', () => {
  it('тело и разбор — туда и обратно', () => {
    expect(parseJob(jobBody({ siteId: SITE, build: 1791479838411 }))).toEqual({ siteId: SITE, build: 1791479838411 });
  });

  it('номер не целый — message-invalid по пути storefront_builds#build', () => {
    const error = failure(() => parseJob({ v: 1, siteId: SITE, build: 1.5 }));
    expect(error.path).toBe('storefront_builds#build');
    expect(errorText(error)).toMatch(/^storefront_builds#build: /);
    expect(errorText('строка')).toBe('строка');
  });
});

// Блок 8 «Секций и SDK», часть 8б-2: product.created и product.deleted из кабинета несут handle — адрес страницы товара.
describe('адреса товаров в событиях product.events', () => {
  const event = (body: Record<string, unknown>) =>
    parseIncoming(PRODUCT_EXCHANGE, { tenantId: SITE, timestamp: AT, ...body }, RECEIVED);

  it('product.created с адресом — адрес товара в список', () => {
    expect(event({ event: 'product.created', productIds: ['p-1'], handle: 'sharf' })).toEqual({
      owner: 'tenant',
      tenantId: SITE,
      type: 'product-change',
      eventAt: AT,
      paths: { add: ['/product/sharf'], remove: [] },
    });
  });

  it('адрес пустой или с «/» — адрес по id', () => {
    expect(event({ event: 'product.created', productIds: ['p-1'], handle: '' })).toMatchObject({
      paths: { add: ['/product/p-1'], remove: [] },
    });
    expect(event({ event: 'product.created', productIds: ['p-1'], handle: 'a/../b' })).toMatchObject({
      paths: { add: ['/product/p-1'], remove: [] },
    });
  });

  it('product.deleted — убрать адрес и адрес по id', () => {
    expect(event({ event: 'product.deleted', productIds: ['p-1'], handle: 'sharf' })).toMatchObject({
      paths: { add: [], remove: ['/product/sharf', '/product/p-1'] },
    });
    expect(event({ event: 'product.deleted', productIds: ['p-1'], handle: '' })).toMatchObject({
      paths: { add: [], remove: ['/product/p-1'] },
    });
  });

  it('без адреса, не один товар, правка, коллекция или поля не по форме — без адресов, событие принято', () => {
    const bodies = [
      { event: 'product.created', productIds: ['p-1'] },
      { event: 'product.created', productIds: ['p-1', 'p-2'], handle: 'sharf' },
      { event: 'product.updated', productIds: ['p-1'], handle: 'sharf' },
      { event: 'product.created', productIds: 'p-1', handle: 'sharf' },
      { event: 'product.created', productIds: ['p-1'], handle: 7 },
      { event: 'collection.updated', productIds: [], collectionIds: ['c-1'] },
      { event: 'product.availability_changed', productIds: ['p-1'], changedFields: ['available'] },
    ];
    for (const body of bodies) {
      const parsed = event(body);
      expect(parsed).toMatchObject({ owner: 'tenant', type: 'product-change' });
      expect(parsed).not.toHaveProperty('paths');
    }
  });
});
