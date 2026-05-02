import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PreviewController } from '../controllers/preview.controller';
import { PreviewService } from '../services/preview.service';
import { PG_CONNECTION } from '../constants';

/**
 * Spec 082 Stage 2a N4: hot-update tokens.css via POST endpoint.
 *
 * Mirrors preview-block-controller.spec.ts pattern. The controller imports
 * `buildTokensCss` directly (not via PreviewService), so this test exercises
 * the real generator with a minimal themeSettings payload — verifying the
 * end-to-end shape (status, content-type, body markers) without touching the
 * PG connection or the PreviewService.
 */
describe('POST /api/sites/:siteId/preview/tokens-css', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PreviewController],
      providers: [
        {
          provide: PreviewService,
          useValue: {
            // tokens-css endpoint does not call PreviewService — stubs are
            // here only because PreviewController constructor requires it.
            renderBlock: jest.fn(),
            renderPreviewPage: jest.fn(),
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('renders CSS from themeSettings + themeId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sites/site-1/preview/tokens-css')
      .send({
        themeSettings: {
          buttonRadius: 12,
          colorSchemes: [
            {
              id: 'scheme-1',
              name: 'Default',
              background: '#ffffff',
              heading: '#000000',
              text: '#222222',
            },
          ],
        },
        themeId: 'rose',
      })
      .expect(200);

    // Generator emits :root + scheme rules. Both must appear.
    expect(res.text).toContain(':root');
    expect(res.headers['content-type']).toMatch(/text\/css/);
    // buttonRadius=12 should land in --radius-button (theme manifest may
    // override; either way rule must be present)
    expect(res.text).toContain('--radius-button:');
  });

  it('accepts empty themeSettings — falls back to defaults', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sites/site-1/preview/tokens-css')
      .send({ themeSettings: {}, themeId: null })
      .expect(200);

    expect(res.text).toContain(':root');
    expect(res.headers['content-type']).toMatch(/text\/css/);
  });
});
