import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PreviewController } from '../controllers/preview.controller';
import { PreviewService } from '../services/preview.service';
import { PG_CONNECTION } from '../constants';

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
          },
        },
        {
          provide: PG_CONNECTION,
          useValue: { select: () => ({ from: () => ({ where: () => [] }) }) },
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
    expect(renderBlockSpy).toHaveBeenCalledWith({
      blockName: 'Hero',
      props: { title: 'Test', id: 'Hero-1' },
      themeId: 'rose',
    });
  });

  it('returns 400 if blockType missing', async () => {
    await request(app.getHttpServer())
      .post('/api/sites/site-1/preview/block')
      .send({ props: {} })
      .expect(400);
  });
});
