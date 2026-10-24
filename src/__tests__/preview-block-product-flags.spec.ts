import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PreviewController } from '../controllers/preview.controller';
import { PreviewService } from '../services/preview.service';
import { PG_CONNECTION, BILLING_RMQ_SERVICE, PRODUCT_RMQ_SERVICE } from '../constants';

/**
 * Баги тестировщика 24.10 (спека 120, Б3/Б4): в превью конструктора форма заявки
 * пропадала после любой правки настроек секции «Товар» — появлялись кнопки
 * корзины и количество. Причина: флаги темы (features.extensionPurchase,
 * extensionThemeLook, requests) превращаются в props секции только в
 * extractPageBlocks (целая страница), а точечная перерисовка (POST
 * /preview/block, ею идёт любая правка) получала сырые props конструктора без
 * них. Секция «Товар» рисовалась без контейнера формы и без пометок
 * data-product-actions / data-product-quantity.
 */
describe('POST /api/sites/:id/preview/block — флаги темы у секции «Товар»', () => {
  const SITE = 'site-1';
  let app: INestApplication;
  let renderBlock: jest.Mock;
  let call = 0;
  let themeId = 'bloom';

  beforeAll(async () => {
    renderBlock = jest.fn(
      async ({ props }: { props: { id?: string } }) =>
        `<section data-puck-component-id="${props.id}"></section>`,
    );
    // select().from().where(): сначала запись сайта, затем ревизия — порядок loadRevisionData.
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            call += 1;
            const site = { currentRevisionId: 'rev-1', publicUrl: null, themeId, tenantId: 'tenant-1', name: 'Магазин' };
            return call === 1 ? [site] : [{ data: { pagesData: { home: { content: [] } } } }];
          },
        }),
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [PreviewController],
      providers: [
        {
          provide: PreviewService,
          useValue: {
            renderBlock,
            hasV2Sections: jest.fn().mockResolvedValue(false),
            resolveBlockScheme: jest.fn().mockResolvedValue(null),
          },
        },
        { provide: PG_CONNECTION, useValue: db },
        { provide: BILLING_RMQ_SERVICE, useValue: { send: jest.fn(), emit: jest.fn() } },
        { provide: PRODUCT_RMQ_SERVICE, useValue: { send: jest.fn(), emit: jest.fn() } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    renderBlock.mockClear();
    call = 0;
  });

  const post = (blockType: string, props: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/api/sites/${SITE}/preview/block`).send({ blockType, props });

  const renderedProps = () => renderBlock.mock.calls[0][0].props as Record<string, unknown>;

  it('bloom: форма расширения и вид «как тема» включены, как на целой странице', async () => {
    themeId = 'bloom';
    await post('Product', { id: 'Product-1', photoPosition: 'right' });
    expect(renderedProps().extensionPurchaseEnabled).toBe(true);
    expect(renderedProps().extensionLook).toBe('theme');
  });

  it('тема с суффиксом версии (rose-1.0, satin@2) читается как rose и satin', async () => {
    themeId = 'rose-1.0';
    await post('Product', { id: 'Product-1' });
    expect(renderedProps().extensionPurchaseEnabled).toBe(true);
    expect(renderedProps().extensionLook).toBe('theme');
    renderBlock.mockClear();
    call = 0;
    themeId = 'satin@2';
    await post('Product', { id: 'Product-1' });
    expect(renderedProps().extensionPurchaseEnabled).toBe(true);
  });

  it('flux: форма включена, вида «как тема» нет', async () => {
    themeId = 'flux';
    await post('Product', { id: 'Product-1' });
    expect(renderedProps().extensionPurchaseEnabled).toBe(true);
    expect(renderedProps().extensionLook).toBeUndefined();
  });

  it('прежняя форма заявки (requests) включается тем же правилом, что на странице', async () => {
    themeId = 'vanilla';
    await post('Product', { id: 'Product-1' });
    expect(renderedProps().requestsEnabled).toBe(true);
  });

  it('другие секции флагов не получают', async () => {
    themeId = 'bloom';
    await post('Hero', { id: 'Hero-1' });
    expect(renderedProps().extensionPurchaseEnabled).toBeUndefined();
    expect(renderedProps().extensionLook).toBeUndefined();
    expect(renderedProps().requestsEnabled).toBeUndefined();
  });
});
