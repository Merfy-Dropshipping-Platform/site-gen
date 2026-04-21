import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ThemePuckConfigModule } from '../src/modules/theme-puck-config.module';

/**
 * E2E test for GET /api/themes/:id/puck-config — Phase 1c Task 3a (revised).
 *
 * Returns JSON-serializable Puck config built from theme-base blocks via
 * resolveBlocks + resolveConstructorConfig. The render function is stripped
 * (not JSON-serializable); the constructor re-attaches its own React render
 * (AstroBlockBridge) client-side in Task 3b.
 */
describe('GET /api/themes/:id/puck-config (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThemePuckConfigModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns Puck config JSON with ≥25 components', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/themes/rose/puck-config')
      .expect(200);

    expect(res.body).toHaveProperty('components');
    expect(res.body).toHaveProperty('categories');
    const componentCount = Object.keys(res.body.components).length;
    expect(componentCount).toBeGreaterThanOrEqual(25); // 18 content + 7 chrome

    // Must have key blocks
    expect(res.body.components.Hero).toBeDefined();
    expect(res.body.components.Header).toBeDefined();
    expect(res.body.components.Footer).toBeDefined();

    // render function MUST be stripped (not JSON-serializable)
    for (const [, cfg] of Object.entries<any>(res.body.components)) {
      expect(cfg.render).toBeUndefined();
      expect(cfg.label).toBeDefined();
      expect(cfg.fields).toBeDefined();
      expect(cfg.defaultProps).toBeDefined();
    }
  }, 30000);

  it('returns rose-overridden Header with rose-specific fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/themes/rose/puck-config')
      .expect(200);

    expect(res.body.components.Header).toBeDefined();
    // Rose Header should have same props as base Header — data compat guaranteed.
    // Categorization from Rose's Header.puckConfig.ts → must be 'navigation'.
    expect(res.body.components.Header.label).toBeDefined();
    expect(res.body.components.Header.category).toBe('navigation');
    // Rose Footer also overridden.
    expect(res.body.components.Footer).toBeDefined();
    expect(res.body.components.Footer.category).toBeDefined();
  }, 30000);

  it('base theme returns default Header (no override)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/themes/base/puck-config')
      .expect(200);

    expect(res.body.components.Header).toBeDefined();
    expect(res.body.components.Footer).toBeDefined();
  }, 30000);
});
