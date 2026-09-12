import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PreviewController } from '../controllers/preview.controller';
import { PreviewService } from '../services/preview.service';
import {
  PG_CONNECTION,
  BILLING_RMQ_SERVICE,
  PRODUCT_RMQ_SERVICE,
} from '../constants';

/**
 * Item-уровневый «глаз» обязан работать и при точечной перерисовке блока.
 *
 * Страница превью и сборка витрины гонят props через `adaptLegacyProps` — там
 * скрытый элемент галереи отбрасывается. А `POST /preview/block`, которым
 * конструктор перерисовывает одну секцию после правки, слал props СЫРЫМИ: на
 * экране плитка возвращалась сразу после того, как мерчант её спрятал, и «глаз»
 * выглядел нерабочим. Тест держит оба пути на одной нормализации.
 */
describe('POST /api/sites/:id/preview/block — скрытый элемент', () => {
  let app: INestApplication;
  let renderBlock: jest.Mock;
  let call = 0;

  const site = {
    currentRevisionId: 'rev-1',
    publicUrl: null,
    themeId: 'rose',
    tenantId: 'tenant-1',
  };

  beforeAll(async () => {
    renderBlock = jest
      .fn()
      .mockResolvedValue('<section data-puck-component-id="Gallery-1"></section>');

    // Drizzle-цепочка select().from().where() отдаёт сначала запись сайта,
    // затем ревизию — порядок вызовов тот же, что у loadRevisionData. Счётчик
    // сбрасывается перед каждым запросом (см. beforeEach), иначе второй запрос
    // получил бы ревизию вместо сайта и упал бы на «нет themeId».
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            call += 1;
            return call === 1 ? [site] : [{ data: { content: [] } }];
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

  const post = (items: unknown[]) =>
    request(app.getHttpServer())
      .post('/api/sites/site-1/preview/block')
      .send({
        blockType: 'Gallery',
        themeId: 'rose',
        props: { id: 'Gallery-1', heading: 'Галерея', layout: 'featured', items },
      });

  const itemsSentToRender = (): unknown[] => {
    const props = renderBlock.mock.calls[0]?.[0]?.props as
      | { items?: unknown[] }
      | undefined;
    return props?.items ?? [];
  };

  it('скрытый элемент не доходит до рендера', async () => {
    await post([
      { id: 'i1', type: 'image', url: '/a.png' },
      { id: 'i2', type: 'image', url: '/b.png', hidden: true },
    ]).expect(200);

    expect(renderBlock).toHaveBeenCalledTimes(1);
    expect(itemsSentToRender().map((i) => (i as { id: string }).id)).toEqual(['i1']);
  });

  it('единственный скрытый элемент оставляет секцию без плиток, а не с плиткой', async () => {
    await post([{ id: 'i1', type: 'image', url: '/a.png', hidden: true }]).expect(200);

    expect(itemsSentToRender()).toEqual([]);
  });

  it('видимые элементы доходят все и в своём порядке', async () => {
    await post([
      { id: 'i1', type: 'image', url: '/a.png' },
      { id: 'i2', type: 'image', url: '/b.png' },
      { id: 'i3', type: 'image', url: '/c.png' },
    ]).expect(200);

    expect(itemsSentToRender().map((i) => (i as { id: string }).id)).toEqual([
      'i1',
      'i2',
      'i3',
    ]);
  });
});
