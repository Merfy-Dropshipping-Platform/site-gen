import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PreviewModule } from '../src/modules/preview.module';
import {
  PreviewService,
  type IAstroContainer,
  type ComponentResolver,
  type ContainerFactory,
} from '../src/services/preview.service';

/**
 * E2E test for GET /api/sites/:id/preview.
 *
 * Phase 0 strategy: we inject stub Astro container + component resolver so
 * ts-jest doesn't try to parse real `.astro` files. This mirrors the approach
 * taken in `src/services/__tests__/preview.service.spec.ts`. The HTTP layer
 * (controller + module wiring) is what's being validated here.
 */
function renderHeroStub(props: Record<string, unknown>): string {
  const title = String(props.title ?? '');
  const variant = String(props.variant ?? 'centered');
  const id = String(props.id ?? '');
  return `<section class="hero color-scheme-1" data-puck-component-id="${id}" data-variant="${variant}"><div><h1>${title}</h1></div></section>`;
}

function buildFakeContainer(): IAstroContainer {
  return {
    async renderToString(component, opts) {
      const props = opts?.props ?? {};
      const tag = (component as { __block?: string }).__block ?? 'Unknown';
      if (tag === 'Hero') return renderHeroStub(props);
      return `<div data-stub="${tag}"></div>`;
    },
  };
}

const heroResolver: ComponentResolver = async (blockName) => {
  if (blockName === 'Hero') return { __block: 'Hero' };
  throw new Error(
    `Block "${blockName}" not available in Phase 0 preview (only Hero wired)`,
  );
};

const containerFactory: ContainerFactory = async () => buildFakeContainer();

describe('GET /api/sites/:id/preview (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [PreviewModule],
    })
      .overrideProvider(PreviewService)
      .useValue(new PreviewService(containerFactory, heroResolver))
      .compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns HTML containing rendered preview page markers', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sites/test-site-id/preview')
      .query({ page: '/' })
      .expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('installPreviewNavAgent');
    expect(res.text).toMatch(/test-site-id/);
  }, 30000);
});
