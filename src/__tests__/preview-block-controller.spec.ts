import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PreviewController } from '../controllers/preview.controller';
import { PreviewService } from '../services/preview.service';
import { PG_CONNECTION, BILLING_RMQ_SERVICE } from '../constants';

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
          },
        },
        {
          provide: PG_CONNECTION,
          useValue: { select: () => ({ from: () => ({ where: () => [] }) }) },
        },
        {
          // PreviewController конструктор инжектит BILLING_RMQ_SERVICE (footer-
          // data в page-render через applyFooterData). Block-эндпоинт его не
          // вызывает — presence-мок ClientProxy достаточно для разрешения DI.
          provide: BILLING_RMQ_SERVICE,
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
    expect(renderBlockSpy).toHaveBeenCalledWith({
      blockName: 'Hero',
      props: { title: 'Test', id: 'Hero-1', siteId: 'site-1' },
      themeId: 'rose',
      isPreview: true,
    });
  });

  it('returns 400 if blockType missing', async () => {
    await request(app.getHttpServer())
      .post('/api/sites/site-1/preview/block')
      .send({ props: {} })
      .expect(400);
  });
});
