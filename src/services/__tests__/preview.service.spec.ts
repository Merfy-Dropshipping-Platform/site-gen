import {
  PreviewService,
  type IAstroContainer,
  type ComponentResolver,
  type ContainerFactory,
} from '../preview.service';

/**
 * Phase 0 test harness: we inject a stub Astro container + component resolver
 * so tests don't need to parse `.astro` files under ts-jest. The stubs mimic
 * the HTML that the real Hero.astro produces, based on the component's
 * markup (see packages/theme-base/blocks/Hero/Hero.astro).
 */
function renderHeroStub(props: Record<string, unknown>): string {
  const title = String(props.title ?? '');
  const variant = String(props.variant ?? 'centered');
  const id = String(props.id ?? '');
  return `<section class="hero color-scheme-1" data-puck-component-id="${id}" data-variant="${variant}"><div><h1>${title}</h1></div></section>`;
}

function buildFakeContainer(): IAstroContainer {
  return {
    async renderToString(_component, opts) {
      const props = opts?.props ?? {};
      // _component is the value returned by the resolver — we tag it with
      // what block to render to keep the stub faithful to the real API shape.
      const tag = (_component as { __block?: string }).__block ?? 'Unknown';
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

describe('PreviewService', () => {
  let svc: PreviewService;

  beforeEach(() => {
    svc = new PreviewService(containerFactory, heroResolver);
  });

  it('renders Hero block to HTML with expected markers', async () => {
    const html = await svc.renderBlock({
      blockName: 'Hero',
      props: {
        id: 'h1',
        title: 'Preview Test Title',
        subtitle: '',
        image: { url: '', alt: '' },
        cta: { text: 'Go', href: '/' },
        variant: 'centered',
        colorScheme: 1,
        padding: { top: 80, bottom: 80 },
      },
    });
    expect(html).toContain('Preview Test Title');
    expect(html).toContain('data-variant="centered"');
  });

  it('renders a full preview page with nav agent injection and tokens.css', async () => {
    const html = await svc.renderPreviewPage({
      blocks: [
        {
          type: 'Hero',
          props: {
            id: 'hero-pilot',
            title: 'PageTitle',
            subtitle: '',
            image: { url: '', alt: '' },
            cta: { text: 'X', href: '/' },
            variant: 'centered',
            colorScheme: 1,
            padding: { top: 80, bottom: 80 },
          },
        },
      ],
      tokensCss: ':root { --radius-button: 0px; }',
      fontHead: '<link rel="stylesheet" href="https://fonts.googleapis.com/test">',
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('PageTitle');
    // Inline postMessage bridge replaces the external preview-nav-agent.js —
    // verify the bridge's signature call instead of the import.
    expect(html).toContain("type: 'ready'");
    expect(html).toContain('--radius-button: 0px');
    expect(html).toContain('fonts.googleapis.com/test');
  });

  it('throws for unknown block name (Phase 0 only Hero supported)', async () => {
    await expect(
      svc.renderBlock({ blockName: 'NonExistent', props: {} }),
    ).rejects.toThrow(/not available|Block/i);
  });

  it('wraps block HTML in color-scheme-N div when colorScheme prop set', async () => {
    const html = await svc.renderPreviewPage({
      blocks: [
        {
          type: 'Hero',
          props: { id: 'hero-scheme', title: 'WrappedHero', colorScheme: 3 },
        },
      ],
      tokensCss: '',
      fontHead: '',
    });
    expect(html).toContain('<div class="color-scheme-3" data-block-scheme="3">');
    expect(html).toContain('WrappedHero');
  });

  it('accepts string scheme-N form and strips the prefix', async () => {
    const html = await svc.renderPreviewPage({
      blocks: [
        {
          type: 'Hero',
          props: { id: 'hero-str', title: 'StringScheme', colorScheme: 'scheme-2' },
        },
      ],
      tokensCss: '',
      fontHead: '',
    });
    expect(html).toContain('data-block-scheme="2"');
  });

  it('does NOT add wrapper when colorScheme prop missing', async () => {
    const html = await svc.renderPreviewPage({
      blocks: [
        { type: 'Hero', props: { id: 'hero-none', title: 'NoScheme' } },
      ],
      tokensCss: '',
      fontHead: '',
    });
    expect(html).toContain('NoScheme');
    expect(html).not.toContain('data-block-scheme');
  });

  describe('PREVIEW_NAV_AGENT_INLINE', () => {
    it('handles update-block postMessage с per-theme guard', async () => {
      // Renderим preview page с rose theme — inline JS bridge должен содержать
      // handler для update-block (используется iframe для hot-replace blocks).
      const html = await svc.renderPreviewPage({
        blocks: [{ type: 'Hero', props: { id: 'Hero-1' } }],
        tokensCss: '',
        fontHead: '',
        themeId: 'rose',
      });
      // Inline-bridge JS должен содержать handler для update-block message
      expect(html).toContain("ev.data.type === 'update-block'");
      // Per-theme guard: только Rose делает hot-replace, другие темы skip
      expect(html).toContain("currentThemeId !== 'rose'");
      // Endpoint URL для fetch (через api-gateway proxy)
      expect(html).toContain('/preview/block');
    });

    it('per-theme guard skips update-block для не-Rose тем', async () => {
      // Один и тот же inline JS используется для всех тем — code identical,
      // behaviour diverges at runtime через currentThemeId set in init message.
      const html = await svc.renderPreviewPage({
        blocks: [{ type: 'Hero', props: { id: 'Hero-1' } }],
        tokensCss: '',
        fontHead: '',
        themeId: 'vanilla',
      });
      // Per-theme guard в коде есть (verify same string presence)
      expect(html).toContain("currentThemeId !== 'rose'");
      // Update-block handler в коде есть (тот же handler для всех тем,
      // guard срабатывает на runtime)
      expect(html).toContain('update-block');
    });

    it('init handler сохраняет themeId и siteId из parent', async () => {
      // Init postMessage от parent должен сохранить currentThemeId и currentSiteId
      // в iframe scope чтобы update-block handler потом использовал их в fetch URL.
      const html = await svc.renderPreviewPage({
        blocks: [{ type: 'Hero', props: { id: 'Hero-1' } }],
        tokensCss: '',
        fontHead: '',
        themeId: 'rose',
      });
      expect(html).toContain("ev.data.type === 'init'");
      expect(html).toContain('currentThemeId =');
      expect(html).toContain('currentSiteId =');
    });
  });
});
