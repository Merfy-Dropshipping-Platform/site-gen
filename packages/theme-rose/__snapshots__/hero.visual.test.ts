/**
 * Phase 1e, Task 5 — visual snapshot for the Hero block rendered with rose
 * design tokens. Rose has no Hero override, so this pins the base Hero
 * component when themed with rose CSS vars — catches regressions if either
 * the base Hero or the rose token set drifts.
 *
 * Snapshot path: `__snapshots__/snapshots/rose/Hero/centered-1440.png`.
 */
import { test, expect } from '@playwright/test';
import {
  renderBlockToHtml,
  startSnapshotServer,
  type SnapshotServer,
} from './render-utils';

const HERO_PROPS = {
  id: 'h1',
  title: 'Visual Snapshot Hero',
  subtitle: 'Testing the Phase 1e visual diff pipeline (rose tokens)',
  image: {
    // Solid-color placeholder — avoids network flake from random picsum.
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="%23f4f4f4"/></svg>',
    alt: 'Test',
  },
  cta: { text: 'Go', href: '/catalog' },
  variant: 'centered' as const,
  colorScheme: 1,
  padding: { top: 80, bottom: 80 },
};

// Derived from packages/theme-rose/tokens.json. Values must stay in sync
// with that file — the jest suite `rose-theme-tokens-consistency.spec.ts`
// guards other consumers; this test is the visual check.
const ROSE_TOKENS_CSS = `
:root {
  --color-bg: 255 255 255;
  --color-heading: 18 18 18;
  --color-text: 18 18 18;
  --color-muted: 153 153 153;
  --color-button-bg: 0 0 0;
  --color-button-text: 255 255 255;
  --color-button-border: 0 0 0;
  --radius-button: 8px;
  --font-heading: 'Bitter', serif;
  --font-body: 'Arsenal', sans-serif;
  --size-hero-heading: 72px;
  --size-hero-button-h: 80px;
  --container-max-width: 1280px;
}
.color-scheme-1 { }
`;

test.describe('Hero visual snapshot (rose tokens, base block)', () => {
  let server: SnapshotServer;

  test.beforeAll(async () => {
    const html = await renderBlockToHtml(
      'Hero',
      'base',
      HERO_PROPS,
      ROSE_TOKENS_CSS,
    );
    server = await startSnapshotServer(html);
  });

  test.afterAll(async () => {
    if (server) await server.stop();
  });

  test('rose/Hero/centered-1440.png', async ({ page }) => {
    await page.goto(server.url);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('rose/Hero/centered-1440.png', {
      fullPage: true,
    });
  });
});
