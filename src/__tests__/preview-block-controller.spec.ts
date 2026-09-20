import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PreviewController } from '../controllers/preview.controller';
import { PreviewService } from '../services/preview.service';
import { PG_CONNECTION, BILLING_RMQ_SERVICE, PRODUCT_RMQ_SERVICE } from '../constants';

describe('POST /api/sites/:siteId/preview/block', () => {
  let app: INestApplication;
  let renderBlockSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PreviewController],
      providers: [
        {
          provide: PreviewService,
          useValue: {
            renderBlock: jest.fn().mockResolvedValue('<section data-puck-component-id="x">hi</section>'),
            // Фаза 2: renderBlock endpoint спрашивает hasV2Sections перед
            // rewrite корневых URL. false → rewrite-ветка пропускается,
            // HTML блока отдаётся как раньше (1:1).
            hasV2Sections: jest.fn().mockResolvedValue(false),
            // Контроллер спрашивает схему блока тем же правилом, что и первичный
            // рендер страницы (`resolveBlockScheme`), чтобы hot-replace не снимал
            // обёртку у секций, которым схему задаёт тема. Мок отстал — без
            // метода эндпоинт падал в 500 «is not a function».
            resolveBlockScheme: jest.fn().mockResolvedValue(null),
          },
        },
        {
          /**
           * ПОЧИНКА 20.09. Мок отдавал `[]` на ЛЮБОЙ select, то есть сайт как
           * будто не существует. Контроллер с тех пор стал требовать тему
           * сайта (`if (!loaded?.themeId) → 500 "site has no themeId"`) —
           * личность рендера берётся из записи сайта, а не из тела запроса, —
           * и тест отвечал 500 вместо 200. В CI этот файл не гоняется, поэтому
           * краснота жила незаметно.
           *
           * Теперь мок отвечает по таблице: сайт отдаёт тему и ссылку на
           * ревизию, ревизия — пустой Puck-документ. Этого хватает, чтобы дойти
           * до `renderBlock`, который и так застаблен.
           */
          provide: PG_CONNECTION,
          useValue: {
            select: (fields?: Record<string, unknown>) => ({
              from: () => ({
                where: () =>
                  fields && 'data' in fields
                    ? [{ data: { pagesData: {} } }]
                    : [
                        {
                          currentRevisionId: 'rev-1',
                          publicUrl: null,
                          themeId: 'rose',
                          tenantId: null,
                          name: 'Тестовый магазин',
                        },
                      ],
              }),
            }),
          },
        },
        {
          // PreviewController конструктор инжектит BILLING_RMQ_SERVICE (footer-
          // data в page-render через applyFooterData). Block-эндпоинт его не
          // вызывает — presence-мок ClientProxy достаточно для разрешения DI.
          provide: BILLING_RMQ_SERVICE,
          useValue: { send: jest.fn(), emit: jest.fn() },
        },
        {
          // PreviewController инжектит PRODUCT_RMQ_SERVICE (fetchCollections для
          // имени/описания коллекции на странице page-collection). Block-эндпоинт
          // его не вызывает — presence-мок ClientProxy достаточен для DI.
          provide: PRODUCT_RMQ_SERVICE,
          useValue: { send: jest.fn(), emit: jest.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    renderBlockSpy = (app.get(PreviewService) as any).renderBlock;
  });

  afterAll(async () => {
    await app.close();
  });

  it('renders single block HTML', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sites/site-1/preview/block')
      .send({
        blockType: 'Hero',
        props: { title: 'Test', id: 'Hero-1' },
        themeId: 'rose',
      })
      .expect(200);

    expect(res.text).toContain('data-puck-component-id="x"');
    // siteId инжектится в props (Product.astro server-side fetch);
    // isPreview: true — graceful stub видим в превью (spec 092 Q3 C).
    // Сверяем СУЩЕСТВЕННОЕ, а не полное равенство: с тех пор контроллер стал
    // передавать ещё и каталожный контекст (`merfy`) и прогонять props через
    // общую нормализацию, которая дописывает пустые cta/image. Жёсткое
    // сравнение ломалось на каждом таком расширении, хотя поведение эндпоинта
    // не менялось — из-за этого тест и лежал красным (в CI он не гоняется).
    expect(renderBlockSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        blockName: 'Hero',
        themeId: 'rose',
        isPreview: true,
        props: expect.objectContaining({
          title: 'Test',
          id: 'Hero-1',
          // siteId инжектится контроллером — Product.astro тянет по нему товар,
          // когда products.json ещё нет (путь превью).
          siteId: 'site-1',
        }),
      }),
    );
  });

  it('returns 400 if blockType missing', async () => {
    await request(app.getHttpServer())
      .post('/api/sites/site-1/preview/block')
      .send({ props: {} })
      .expect(400);
  });
});
