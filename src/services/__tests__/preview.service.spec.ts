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
    expect(html).toContain('installPreviewNavAgent');
    expect(html).toContain('--radius-button: 0px');
    expect(html).toContain('fonts.googleapis.com/test');
  });

  it('throws for unknown block name (Phase 0 only Hero supported)', async () => {
    await expect(
      svc.renderBlock({ blockName: 'NonExistent', props: {} }),
    ).rejects.toThrow(/not available|Block/i);
  });
});
