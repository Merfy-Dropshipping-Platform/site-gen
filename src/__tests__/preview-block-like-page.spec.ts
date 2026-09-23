import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PreviewController } from '../controllers/preview.controller';
import { PreviewService } from '../services/preview.service';
import { themeBlocksFor } from '../themes/page-blocks';
import { PG_CONNECTION, BILLING_RMQ_SERVICE, PRODUCT_RMQ_SERVICE } from '../constants';

/**
 * Точечная перерисовка секции (ею идёт любая правка в панели конструктора)
 * обязана давать то же, что целая страница превью. Замер 23.09, пять тем × пять
 * страниц: совпадали 139 секций, расходились две вещи —
 *   - картинка «О нас» bloom шла с витрины (данные конструктора разрешены на
 *     адрес витрины), у страницы — из копии темы; у неопубликованного магазина
 *     после правки картинка пропадала;
 *   - id магазина во встроенном скрипте шапки оставался пустым.
 * Под выключателем PARITY_HOT; выключен — прежнее поведение.
 */
describe('POST /api/sites/:id/preview/block — как целая страница (PARITY_HOT)', () => {
  const SITE = 'site-1';
  const SHOP = 'https://shop.merfy.ru';
  const savedEnv = process.env.PARITY_HOT;
  let app: INestApplication;
  let renderBlock: jest.Mock;
  let call = 0;

  const site = { currentRevisionId: 'rev-1', publicUrl: SHOP, themeId: 'bloom', tenantId: 'tenant-1', name: 'Магазин' };

  beforeAll(async () => {
    renderBlock = jest.fn(
      async ({ props }: { props: { id?: string; image?: { url?: string } } }) =>
        `<section data-puck-component-id="${props.id}"><img src="${props.image?.url ?? ''}">` +
        '<script>const shopId = "";</script></section>',
    );
    // select().from().where(): сначала запись сайта, затем ревизия — порядок loadRevisionData.
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            call += 1;
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
            hasV2Sections: jest.fn().mockResolvedValue(true),
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
    if (savedEnv === undefined) delete process.env.PARITY_HOT;
    else process.env.PARITY_HOT = savedEnv;
    await app.close();
  });

  beforeEach(() => {
    renderBlock.mockClear();
    call = 0;
  });

  const post = (blockType: string, props: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/api/sites/${SITE}/preview/block`).send({ blockType, props });

  const renderedProps = () => renderBlock.mock.calls[0][0].props as Record<string, unknown>;

  describe('выключатель включён для сайта', () => {
    beforeAll(() => {
      process.env.PARITY_HOT = SITE;
    });

    it('картинка темы с адреса витрины → из копии темы, как у целой страницы', async () => {
      const res = await post('ImageWithText', { id: 'IWT-1', image: { url: `${SHOP}/images/about-photo.webp` } });
      expect((renderedProps().image as { url: string }).url).toBe('/images/about-photo.webp');
      expect(res.text).toContain('src="/__theme/bloom/images/about-photo.webp"');
    });

    it('загрузка мерчанта (MinIO) остаётся как есть', async () => {
      const res = await post('ImageWithText', { id: 'IWT-1', image: { url: 'https://minio.merfy.ru/u/a.webp' } });
      expect(res.text).toContain('src="https://minio.merfy.ru/u/a.webp"');
    });

    it('вариант раскладки темы подставлен, как у целой страницы', async () => {
      await post('Hero', { id: 'Hero-1' });
      const themeVariant = (themeBlocksFor('bloom').Hero as { variant?: string } | undefined)?.variant;
      expect(renderedProps().variant).toBe(themeVariant);
    });

    it('id магазина в встроенном скрипте проставлен', async () => {
      const res = await post('Header', { id: 'Header-1' });
      expect(res.text).toContain(`const shopId = "${SITE}";`);
    });
  });

  describe('выключатель выключен — прежнее поведение', () => {
    beforeAll(() => {
      process.env.PARITY_HOT = 'off';
    });

    it('картинка остаётся с адреса витрины, id магазина пуст', async () => {
      const res = await post('ImageWithText', { id: 'IWT-1', image: { url: `${SHOP}/images/about-photo.webp` } });
      expect(res.text).toContain(`src="${SHOP}/images/about-photo.webp"`);
      expect(res.text).toContain('const shopId = "";');
    });

    it('вариант раскладки не подставляется', async () => {
      await post('Hero', { id: 'Hero-1' });
      expect(renderedProps().variant).toBeUndefined();
    });
  });
});
