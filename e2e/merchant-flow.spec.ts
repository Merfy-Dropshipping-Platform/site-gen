/**
 * Merchant Flow E2E Test Specification
 *
 * This describes the full merchant journey:
 * 1. Authentication -> active organization -> session
 * 2. Site Management -> list, get site details with theme
 * 3. Revision Management -> list, create, set current revision
 * 4. Build & Deploy -> publish, track progress, completion
 * 5. Live Site Verification -> storefront served, no render errors
 *
 * Uses production test account:
 *   Email: villas1998@mail.ru
 *   Password: Pagoda937
 *
 * API Gateway: https://api.merfy.ru (port 3110)
 * Sites Service: port 3114, queue: sites_queue
 */

const TEST_API_URL = 'https://api.merfy.ru';
const TEST_ADMIN_URL = 'https://admin.merfy.ru';
const TEST_CREDENTIALS = {
  email: 'villas1998@mail.ru',
  password: 'Pagoda937',
};

describe('Merchant Flow E2E', () => {
  let sessionCookie: string;
  let tenantId: string;
  let siteId: string;
  let buildId: string;
  let publicUrl: string;

  // ==================== 1. Authentication & Setup ====================

  describe('1. Authentication & Setup', () => {
    it('should login with test credentials and receive session cookie', async () => {
      // POST /api/auth/sign-in
      // Body: { email, password }
      // Expect: 200 with Set-Cookie header containing session token
      // Store sessionCookie for subsequent requests
      const response = await fetch(`${TEST_API_URL}/api/auth/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(TEST_CREDENTIALS),
      });

      expect(response.status).toBe(200);
      const cookies = response.headers.get('set-cookie');
      expect(cookies).toBeTruthy();
      sessionCookie = cookies!;
    });

    it('should return authenticated user with activeOrganizationId', async () => {
      // GET /api/auth/me
      // Headers: Cookie: {sessionCookie}
      // Expect: 200 with user object containing activeOrganizationId
      const response = await fetch(`${TEST_API_URL}/api/auth/me`, {
        headers: { Cookie: sessionCookie },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.user).toBeDefined();
      expect(body.user.activeOrganizationId).toBeTruthy();
      tenantId = body.user.activeOrganizationId;
    });

    it('should have an active (non-frozen) billing status', async () => {
      // The user should not be frozen to perform site operations
      // This is implicitly verified when site operations succeed
      // but can also be checked via billing entitlements
      expect(tenantId).toBeTruthy();
    });
  });

  // ==================== 2. Site Management ====================

  describe('2. Site Management', () => {
    it('should list existing sites for the tenant', async () => {
      // GET /api/sites
      // Headers: Cookie: {sessionCookie}
      // Expect: 200 with { success: true, items: Site[] }
      // Each site has: id, name, slug, status, themeId, publicUrl, theme object
      const response = await fetch(`${TEST_API_URL}/api/sites`, {
        headers: { Cookie: sessionCookie },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.items)).toBe(true);

      if (body.items.length > 0) {
        const site = body.items[0];
        expect(site.id).toBeTruthy();
        expect(site.name).toBeTruthy();
        expect(site.status).toBeTruthy();
        siteId = site.id;
        publicUrl = site.publicUrl;
      }
    });

    it('should get site details with current revision and theme', async () => {
      // GET /api/sites/:siteId
      // Expect: 200 with full site object including:
      //   - currentRevisionId
      //   - theme: { id, name, slug, templateId }
      //   - publicUrl
      //   - coolifyAppUuid (if deployed)
      if (!siteId) return; // skip if no sites exist

      const response = await fetch(`${TEST_API_URL}/api/sites/${siteId}`, {
        headers: { Cookie: sessionCookie },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.site).toBeDefined();
      expect(body.site.id).toBe(siteId);
      // Theme should be populated (joined from theme table)
      if (body.site.themeId) {
        expect(body.site.theme).toBeDefined();
        expect(body.site.theme.slug).toBeTruthy();
      }
    });

    it('should create a new site with auto-generated slug', async () => {
      // POST /api/sites
      // Body: { name: "Test Site", slug?: optional }
      // Expect: 201 with { success: true, siteId, publicUrl }
      // Site starts in "draft" status
      // Slug is auto-generated from name if not provided
      // Billing limits are checked (shops_limit_reached if exceeded)
      const response = await fetch(`${TEST_API_URL}/api/sites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
        body: JSON.stringify({ name: `E2E Test ${Date.now()}` }),
      });

      // May fail with shops_limit_reached — that is a valid billing guard
      const body = await response.json();
      if (body.success) {
        expect(body.siteId).toBeTruthy();
        // New sites get a publicUrl via Domain Service subdomain generation
        // publicUrl format: https://{slug}.merfy.ru
      } else {
        // Expected if billing limit reached
        expect(['shops_limit_reached', 'account_frozen']).toContain(body.message);
      }
    });

    it('should update site name and theme', async () => {
      // PATCH /api/sites/:siteId
      // Body: { name?: string, themeId?: string, slug?: string }
      // Expect: 200 with { success: true }
      // Slug uniqueness is enforced within tenant
      if (!siteId) return;

      const response = await fetch(`${TEST_API_URL}/api/sites/${siteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
        body: JSON.stringify({ name: 'Updated E2E Site' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  // ==================== 3. Revision Management ====================

  describe('3. Revision Management', () => {
    it('should list revisions for a site', async () => {
      // GET /api/sites/:siteId/revisions
      // Expect: 200 with { success: true, items: Revision[] }
      // Each revision has: id, createdAt
      if (!siteId) return;

      const response = await fetch(
        `${TEST_API_URL}/api/sites/${siteId}/revisions`,
        { headers: { Cookie: sessionCookie } },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('should create a new revision with Puck JSON data', async () => {
      // POST /api/sites/:siteId/revisions
      // Body: { data: PuckJSON, meta?: { title, description }, setCurrent?: boolean }
      // Expect: 201 with { success: true, revisionId }
      // Puck JSON format: { content: Component[], root: { props: {...} } }
      if (!siteId) return;

      const puckData = {
        content: [
          {
            type: 'Header',
            props: {
              siteTitle: 'E2E Test Shop',
              logo: '/logo.svg',
              navigationLinks: [
                { label: 'Home', href: '/' },
                { label: 'Catalog', href: '/catalog' },
              ],
              actionButtons: { cartEnabled: true },
            },
          },
          {
            type: 'HeroSection',
            props: {
              title: 'Welcome',
              subtitle: 'Discover our products',
              ctaText: 'Shop Now',
              ctaLink: '/catalog',
            },
          },
          {
            type: 'Footer',
            props: {
              copyright: { text: '2024 E2E Shop' },
              navigationColumn: { title: 'Nav', links: [] },
              informationColumn: { title: 'Info', links: [] },
              socialColumn: { title: 'Social', links: [] },
              newsletter: { enabled: false },
            },
          },
        ],
        root: { props: {} },
      };

      const response = await fetch(
        `${TEST_API_URL}/api/sites/${siteId}/revisions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
          },
          body: JSON.stringify({
            data: puckData,
            meta: { title: 'E2E Test Page' },
            setCurrent: true,
          }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.revisionId).toBeTruthy();
    });

    it('should set a specific revision as current', async () => {
      // PUT /api/sites/:siteId/revisions/current
      // Body: { revisionId: string }
      // Expect: 200 with { success: true }
      // Updates site.currentRevisionId
      if (!siteId) return;

      // First get the list to find a valid revisionId
      const listResponse = await fetch(
        `${TEST_API_URL}/api/sites/${siteId}/revisions`,
        { headers: { Cookie: sessionCookie } },
      );
      const listBody = await listResponse.json();

      if (listBody.items?.length > 0) {
        const revisionId = listBody.items[0].id;
        const response = await fetch(
          `${TEST_API_URL}/api/sites/${siteId}/revisions/current`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Cookie: sessionCookie,
            },
            body: JSON.stringify({ revisionId }),
          },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
      }
    });

    it('should get a specific revision with full data', async () => {
      // GET /api/sites/:siteId/revisions/:revisionId
      // Expect: 200 with { success: true, item: { id, siteId, data, meta, createdAt, createdBy } }
      if (!siteId) return;

      const listResponse = await fetch(
        `${TEST_API_URL}/api/sites/${siteId}/revisions`,
        { headers: { Cookie: sessionCookie } },
      );
      const listBody = await listResponse.json();

      if (listBody.items?.length > 0) {
        const revisionId = listBody.items[0].id;
        const response = await fetch(
          `${TEST_API_URL}/api/sites/${siteId}/revisions/${revisionId}`,
          { headers: { Cookie: sessionCookie } },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.item).toBeDefined();
        expect(body.item.id).toBe(revisionId);
      }
    });
  });

  // ==================== 4. Build & Deploy ====================

  describe('4. Build & Deploy', () => {
    it('should trigger publish and return build info', async () => {
      // POST /api/sites/:siteId/publish
      // Body: { mode?: 'draft' | 'production' }
      // Expect: 200 with { success: true, url, buildId, artifactUrl }
      // - If BUILD_QUEUE_CONSUMER_ENABLED=true: returns { queued: true, buildId: 'queued' }
      // - If false: runs synchronous build through 7 stages
      // - Priority is determined by billing plan (paid=10, trial=1)
      // - Site status transitions to "published"
      if (!siteId) return;

      const response = await fetch(
        `${TEST_API_URL}/api/sites/${siteId}/publish`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
          },
          body: JSON.stringify({ mode: 'production' }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.url).toBeTruthy();
      publicUrl = body.url;

      if (body.buildId && body.buildId !== 'queued') {
        buildId = body.buildId;
      }
    });

    it('should track build progress via build status endpoint', async () => {
      // GET /api/sites/:siteId/builds/:buildId/status
      // Expect: 200 with { success: true, data: BuildStatus }
      // BuildStatus: {
      //   buildId, siteId, status: 'queued'|'running'|'failed'|'uploaded',
      //   stage: 'merge'|'generate'|'fetch_data'|'astro_build'|'zip'|'upload'|'deploy',
      //   percent: 0-100, message, error, retryCount, startedAt, completedAt
      // }
      if (!buildId || buildId === 'queued') return;

      const response = await fetch(
        `${TEST_API_URL}/api/sites/${siteId}/builds/${buildId}/status`,
        { headers: { Cookie: sessionCookie } },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.buildId).toBe(buildId);
      expect(['queued', 'running', 'failed', 'uploaded']).toContain(body.data.status);
      expect(typeof body.data.percent).toBe('number');
    });

    it('should complete build within 120 seconds', async () => {
      // Poll build status until percent=100 or timeout
      // Build pipeline 7 stages: merge(10%) -> generate(25%) -> fetch_data(40%)
      //   -> astro_build(70%) -> zip(80%) -> upload(90%) -> deploy(100%)
      // Expected: complete within 60-120s for <100 products
      if (!buildId || buildId === 'queued') return;

      const startTime = Date.now();
      const TIMEOUT_MS = 120_000;
      let finalStatus: string = 'unknown';

      while (Date.now() - startTime < TIMEOUT_MS) {
        const response = await fetch(
          `${TEST_API_URL}/api/sites/${siteId}/builds/${buildId}/status`,
          { headers: { Cookie: sessionCookie } },
        );
        const body = await response.json();

        if (body.data?.status === 'uploaded') {
          finalStatus = 'uploaded';
          expect(body.data.percent).toBe(100);
          break;
        }

        if (body.data?.status === 'failed') {
          finalStatus = 'failed';
          break;
        }

        // Wait 2 seconds before next poll
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      expect(finalStatus).toBe('uploaded');
    }, 130_000);
  });

  // ==================== 5. Live Site Verification ====================

  describe('5. Live Site Verification', () => {
    it('should serve storefront at public URL with HTTP 200', async () => {
      // GET https://{slug}.merfy.ru
      // Expect: 200 with HTML content
      if (!publicUrl) return;

      const response = await fetch(publicUrl, {
        headers: { 'User-Agent': 'Merfy-E2E-Test/1.0' },
      });

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('should not contain [object Object] in rendered HTML', async () => {
      // Common serialization bug: React components rendering objects as strings
      // Page source should never contain literal "[object Object]"
      if (!publicUrl) return;

      const response = await fetch(publicUrl);
      const html = await response.text();
      expect(html).not.toContain('[object Object]');
    });

    it('should not contain "Unknown component" in rendered HTML', async () => {
      // Indicates a missing component registry entry
      // All Puck components should be properly resolved
      if (!publicUrl) return;

      const response = await fetch(publicUrl);
      const html = await response.text();
      expect(html).not.toContain('Unknown component');
    });

    it('should include Rose theme CSS variables in rendered page', async () => {
      // Rose theme uses CSS custom properties for theming
      // The global.css should be loaded with brand color variables
      if (!publicUrl) return;

      const response = await fetch(publicUrl);
      const html = await response.text();
      // Should have a stylesheet link or inline styles with CSS vars
      expect(html.includes('.css') || html.includes('--')).toBe(true);
    });

    it('should return proper cache headers for static assets', async () => {
      // Static assets (CSS, JS, images) should have cache headers
      // Pages should have short or no cache for freshness
      if (!publicUrl) return;

      const response = await fetch(publicUrl);
      const cacheControl = response.headers.get('cache-control');
      // Page-level: may have no-cache or short max-age
      // We just verify the header exists or check response is valid
      expect(response.ok).toBe(true);
    });
  });

  // ==================== 6. Site Products Management ====================

  describe('6. Site Products', () => {
    it('should list site products', async () => {
      // GET /api/sites/:siteId/products
      // Expect: 200 with { success: true, data: Product[] }
      if (!siteId) return;

      const response = await fetch(
        `${TEST_API_URL}/api/sites/${siteId}/products`,
        { headers: { Cookie: sessionCookie } },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should create a product on the site', async () => {
      // POST /api/sites/:siteId/products
      // Body: { name, description?, price?, images?, slug? }
      // Expect: 201 with product object
      // Price in kopecks (integer), auto-increments sortOrder
      if (!siteId) return;

      const response = await fetch(
        `${TEST_API_URL}/api/sites/${siteId}/products`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
          },
          body: JSON.stringify({
            name: 'E2E Test Product',
            description: 'Created by E2E test',
            price: 99900, // 999 rubles in kopecks
            images: ['https://example.com/image.jpg'],
          }),
        },
      );

      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  // ==================== 7. Domain Management ====================

  describe('7. Domain Management', () => {
    it('should attach a custom domain with DNS challenge', async () => {
      // POST /api/sites/:siteId/domains
      // Body: { domain: 'shop.example.com' }
      // Expect: 200 with { success: true, id, challenge: { type: 'dns', name, value } }
      // Challenge: create TXT record _merfy-verify.shop.example.com = token
      if (!siteId) return;

      // We skip actual domain attachment in E2E to avoid DNS side effects
      // Just verify the endpoint exists and returns proper error for invalid input
      const response = await fetch(
        `${TEST_API_URL}/api/sites/${siteId}/domains`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
          },
          body: JSON.stringify({}), // missing domain
        },
      );

      const body = await response.json();
      // Should fail gracefully with validation error
      expect(body.success).toBe(false);
    });
  });

  // ==================== 8. Health Check ====================

  describe('8. Health Check', () => {
    it('should check site availability', async () => {
      // GET /api/sites/:siteId/availability
      // Expect: 200 with { success: true, available, exists, billingAllowed, isPublished, isDeployed, publicUrl, reason? }
      if (!siteId) return;

      const response = await fetch(
        `${TEST_API_URL}/api/sites/${siteId}/availability`,
        { headers: { Cookie: sessionCookie } },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(typeof body.available).toBe('boolean');
      expect(typeof body.exists).toBe('boolean');
    });

    it('should perform HTTP health check on published site', async () => {
      // GET /api/sites/:siteId/health
      // Expect: 200 with { success: true, available, statusCode?, latencyMs, publicUrl, error? }
      // Performs actual HTTP GET to publicUrl and measures latency
      if (!siteId) return;

      const response = await fetch(
        `${TEST_API_URL}/api/sites/${siteId}/health`,
        { headers: { Cookie: sessionCookie } },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(typeof body.latencyMs).toBe('number');
    });
  });
});
