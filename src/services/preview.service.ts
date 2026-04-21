import { Injectable, Optional } from '@nestjs/common';

/**
 * Input for rendering a single block to HTML.
 */
export interface RenderBlockInput {
  blockName: string;
  props: Record<string, unknown>;
}

/**
 * Input for rendering a full preview page (doctype + head + blocks + nav agent).
 */
export interface RenderPreviewPageInput {
  blocks: Array<{ type: string; props: Record<string, unknown> }>;
  tokensCss: string;
  fontHead: string;
}

/**
 * Minimal shape of the Astro Container API we depend on. Kept as a structural
 * type so tests can stub it without pulling in the real Astro runtime (which
 * cannot parse .astro files in ts-jest).
 */
export interface IAstroContainer {
  renderToString(
    component: unknown,
    opts?: { props?: Record<string, unknown> },
  ): Promise<string>;
}

/**
 * Resolves a block name to an Astro component module default export.
 * In production this dynamically imports from @merfy/theme-base. In tests
 * this is injected so we can return a fake component without parsing .astro.
 */
export type ComponentResolver = (blockName: string) => Promise<unknown>;

/**
 * Factory that creates an Astro container. In production this calls
 * `experimental_AstroContainer.create()` from `astro/container`. In tests
 * callers override this to return a stub container.
 */
export type ContainerFactory = () => Promise<IAstroContainer>;

/**
 * Default component resolver: dynamic-imports the precompiled block module
 * produced by `pnpm build:blocks` (see scripts/compile-astro-blocks.mjs).
 *
 * Expected output layout (flat, under dist/astro-blocks/):
 *   <pkg>__<blockName>__<fileName>.mjs
 * e.g. `theme-base__Hero__Hero.mjs`
 *
 * Phase 0: only theme-base is searched. Phase 1 will add theme cascade
 * (theme-<name> ?? theme-base).
 */
const defaultComponentResolver: ComponentResolver = async (blockName) => {
  const pkg = 'theme-base';
  const fileName = blockName;
  const moduleName = `${pkg}__${blockName}__${fileName}.mjs`;

  // Path relative to this compiled service file at runtime. NestJS typically
  // runs with cwd=sites-root, so dist/astro-blocks/ is directly accessible.
  // Second candidate handles running from monorepo root.
  const { resolve } = await import('node:path');
  const candidates = [
    resolve(process.cwd(), 'dist', 'astro-blocks', moduleName),
    resolve(
      process.cwd(),
      'backend',
      'services',
      'sites',
      'dist',
      'astro-blocks',
      moduleName,
    ),
  ];

  let lastErr: unknown;
  for (const p of candidates) {
    try {
      const mod = (await import(p)) as { default?: unknown };
      if (!mod.default) {
        throw new Error(
          `Compiled module ${moduleName} has no default export`,
        );
      }
      return mod.default;
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(
    `Block "${blockName}" not resolvable. Tried ${candidates.length} paths. ` +
      `Run 'pnpm build:blocks' first. Last error: ${String(lastErr)}`,
  );
};

/**
 * Default container factory. In production calls Astro's experimental
 * Container API. We import it lazily to avoid loading Astro in jest unless
 * the production path is actually hit.
 *
 * The specifier is built at runtime (via a variable) so ts-jest's type
 * resolver doesn't try to locate the module at test time — sites' tsconfig
 * uses `moduleResolution: node` which doesn't read Astro's package exports
 * map. At Node runtime the ESM resolver DOES read the exports map, so this
 * works in production.
 */
const defaultContainerFactory: ContainerFactory = async () => {
  const specifier = 'astro/container';
  const mod = (await import(/* @vite-ignore */ specifier)) as {
    experimental_AstroContainer: { create(): Promise<IAstroContainer> };
  };
  const container = await mod.experimental_AstroContainer.create();
  return container;
};

@Injectable()
export class PreviewService {
  private container: IAstroContainer | null = null;
  private readonly containerFactory: ContainerFactory;
  private readonly componentResolver: ComponentResolver;

  constructor(
    @Optional() containerFactory?: ContainerFactory,
    @Optional() componentResolver?: ComponentResolver,
  ) {
    this.containerFactory = containerFactory ?? defaultContainerFactory;
    this.componentResolver = componentResolver ?? defaultComponentResolver;
  }

  private async getContainer(): Promise<IAstroContainer> {
    if (!this.container) {
      this.container = await this.containerFactory();
    }
    return this.container;
  }

  /**
   * Render a single named block to an HTML string.
   */
  async renderBlock(input: RenderBlockInput): Promise<string> {
    // Resolve first so unknown blocks fail fast without initializing the container.
    const Component = await this.componentResolver(input.blockName);
    const container = await this.getContainer();
    const html = await container.renderToString(Component, {
      props: input.props,
    });
    return html;
  }

  /**
   * Render a full preview page: doctype, head (fontHead + tokens.css),
   * each block's HTML, and the preview nav agent installer.
   */
  async renderPreviewPage(input: RenderPreviewPageInput): Promise<string> {
    const renderedBlocks: string[] = [];
    for (const b of input.blocks) {
      const html = await this.renderBlock({
        blockName: b.type,
        props: b.props,
      });
      renderedBlocks.push(html);
    }

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Preview</title>
  ${input.fontHead}
  <style>${input.tokensCss}</style>
</head>
<body>
  ${renderedBlocks.join('\n')}
  <script type="module">
    import { installPreviewNavAgent } from '/runtime/preview-nav-agent.js';
    installPreviewNavAgent({ origin: '*' });
  </script>
</body>
</html>`;
  }
}
