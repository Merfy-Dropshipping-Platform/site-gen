/**
 * Phase 2a visual snapshot for the Hero block rendered with vanilla design
 * tokens. Vanilla has no Hero override, so this pins the base Hero component
 * when themed with vanilla CSS vars — catches regressions if either the base
 * Hero or the vanilla token set drifts.
 *
 * Snapshot path: `__snapshots__/snapshots/vanilla/Hero/centered-1440.png`.
 */
import { test, expect } from '@playwright/test';
import {
  renderBlockToHtml,
  startSnapshotServer,
  type SnapshotServer,
} from './render-utils';

const HERO_PROPS = {
  id: 'h1',
  title: 'Vanilla Snapshot Hero',
  subtitle: 'Testing the Phase 2a visual diff pipeline (vanilla tokens)',
  image: {
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="%23d0d4c8"/></svg>',
    alt: 'Test',
  },
  cta: { text: 'Смотреть', href: '/catalog' },
  variant: 'centered' as const,
  colorScheme: 1,
  padding: { top: 80, bottom: 80 },
};

// Derived from packages/theme-vanilla/tokens.json and theme.json scheme-3
// (Light Gray — most representative default for content blocks).
const VANILLA_TOKENS_CSS = `
:root {
  --color-bg: 238 238 238;
  --color-heading: 38 49 28;
  --color-text: 38 49 28;
  --color-muted: 68 68 68;
  --color-button-bg: 58 69 48;
  --color-button-text: 255 255 255;
  --color-button-border: 58 69 48;
  --radius-button: 0px;
  --radius-input: 0px;
  --font-heading: 'Bitter', serif;
  --font-body: 'Arsenal', sans-serif;
  --size-hero-heading: 72px;
  --size-hero-button-h: 48px;
  --container-max-width: 1320px;
}
.color-scheme-1 { }
`;

test.describe('Hero visual snapshot (vanilla tokens, base block)', () => {
  let server: SnapshotServer;

  test.beforeAll(async () => {
    const html = await renderBlockToHtml(
      'Hero',
      'base',
      HERO_PROPS,
      VANILLA_TOKENS_CSS,
    );
    server = await startSnapshotServer(html);
  });

  test.afterAll(async () => {
    if (server) await server.stop();
  });

  test('vanilla/Hero/centered-1440.png', async ({ page }) => {
    await page.goto(server.url);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('vanilla/Hero/centered-1440.png', {
      fullPage: true,
    });
  });
});
