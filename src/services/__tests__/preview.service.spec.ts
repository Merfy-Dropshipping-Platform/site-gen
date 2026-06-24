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

  it('renders graceful error stub for unknown block name (spec 092)', async () => {
    const html = await svc.renderBlock({ blockName: 'NonExistent', props: {} });
    expect(html).toContain('data-render-error="NonExistent"');
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
    it('handles update-block postMessage с per-theme allowlist', async () => {
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
      // 121b720: per-theme allowlist удалён — hot-update для всех тем.
      expect(html).not.toContain("HOT_UPDATE_ALLOWED_THEMES");
      // Endpoint URL для fetch (через api-gateway proxy)
      expect(html).toContain('/preview/block');
    });

    it('hot-update доступен для всех тем (allowlist удалён, 121b720)', async () => {
      // Один и тот же inline JS используется для всех тем.
      const html = await svc.renderPreviewPage({
        blocks: [{ type: 'Hero', props: { id: 'Hero-1' } }],
        tokensCss: '',
        fontHead: '',
        themeId: 'vanilla',
      });
      expect(html).not.toContain("HOT_UPDATE_ALLOWED_THEMES");
      expect(html).toContain('update-block');
    });

    it('106 US2: reconcile-агент фетчит НОВЫЕ body-блоки и валит в missing при сбое', async () => {
      // US2 (T014/T015): новый блок (нет в DOM и stash) → server fetch /preview/block;
      // несколько новых → параллельно (Promise.all); сбой/невалидный HTML → id в
      // missing → reconcile-ack ok:false → parent делает один тихий reload.
      const html = await svc.renderPreviewPage({
        blocks: [{ type: 'Hero', props: { id: 'Hero-1' } }],
        tokensCss: '',
        fontHead: '',
        themeId: 'rose',
      });
      // Reconcile-handler присутствует.
      expect(html).toContain("ev.data.type === 'reconcile'");
      // Новые/изменённые body-блоки собираются в очередь fetch и тянутся параллельно.
      expect(html).toContain('rcFetchJobs');
      expect(html).toContain('Promise.all(rcFetchJobs');
      // Fetch идёт на существующий single-block эндпоинт.
      expect(html).toContain("'/api/sites/' + currentSiteId + '/preview/block'");
      // Сбой/невалидный фрагмент → блок в missing.
      expect(html).toContain('rcMissing.push(job.id)');
      // Непустой missing → ack ok:false (агрессивная страховка на стороне parent).
      expect(html).toContain('ok: false, applied: [], missing: rcMissing');
    });

    it('106 US2: reuse без сети — живой узел/stash при совпадении propsHash; новый хром → reload', async () => {
      const html = await svc.renderPreviewPage({
        blocks: [{ type: 'Hero', props: { id: 'Hero-1' } }],
        tokensCss: '',
        fontHead: '',
        themeId: 'rose',
      });
      // renderedPropsHash сравнивается с дескриптором → решение reuse / fetch.
      expect(html).toContain('RC_RENDERED_HASH');
      // Stash переиспользуется только при совпадении propsHash (мгновенно, без сети).
      expect(html).toContain('RC_STASH[rtb.id] && RC_RENDERED_HASH[rtb.id] === rtb.propsHash');
      // Живой узел main — DOM авторитетен, reuse без сети.
      expect(html).toContain('rcParts.push(rcLive.outerHTML)');
      // Новый хром-блок без DOM (Header/Footer/PromoBanner) → аварийный reload.
      expect(html).toContain('rcNewChrome');
      expect(html).toContain("rtb.type === 'Header' || rtb.type === 'Footer' || rtb.type === 'PromoBanner'");
    });

    it('update-block агент создаёт scheme-обёртку on demand и снимает её симметрично', async () => {
      // Hot-replace: если у блока не было scheme-обёртки, а colorScheme выбран —
      // агент оборачивает HTML в <div class="color-scheme-N" data-block-scheme="N">
      // (зеркально серверному wrapScheme). Если scheme снят — класс/атрибут
      // снимаются с существующей обёртки.
      const html = await svc.renderPreviewPage({
        blocks: [{ type: 'Hero', props: { id: 'Hero-1' } }],
        tokensCss: '',
        fontHead: '',
        themeId: 'rose',
      });
      // Ветка создания обёртки on demand
      expect(html).toContain('else if (newSchemeId)');
      expect(html).toContain('\'<div class="color-scheme-\' + newSchemeId');
      // Re-hydrate скриптов внутри созданной обёртки
      expect(html).toContain('newWrapped.parentElement || newWrapped');
      // Симметрия: scheme снят → снимаем класс и data-атрибут с обёртки
      expect(html).toContain("wrapper.className = ''");
      expect(html).toContain('wrapper.removeAttribute(schemeAttr)');
    });

    it('executeScriptsIn диспатчит astro:page-load для ре-инициализации hoisted-скриптов', async () => {
      // Hoisted-скрипты v2-секций инлайнятся компилятором с window-гардом
      // «один раз на страницу» — после hot-replace ре-гидрация идёт через
      // стандартный сигнал Astro, на который подписаны скрипты темы.
      const html = await svc.renderPreviewPage({
        blocks: [{ type: 'Hero', props: { id: 'Hero-1' } }],
        tokensCss: '',
        fontHead: '',
        themeId: 'rose',
      });
      expect(html).toContain("document.dispatchEvent(new Event('astro:page-load'))");
    });

    it('098: update-block монотонный порядок применения + валидация HTML + коалесинг ре-инициализации', async () => {
      // Инцидент 78ea7210 (слайдер «Затемнение»): серия update-block одного
      // блока через очередь gateway возвращалась не по порядку; тело любого
      // ответа (включая ошибки) вставлялось вместо секции — блок «исчезал».
      const html = await svc.renderPreviewPage({
        blocks: [{ type: 'Hero', props: { id: 'Hero-1' } }],
        tokensCss: '',
        fontHead: '',
        themeId: 'rose',
      });
      // Монотонность: seq до fetch, stale-ответ отбрасывается
      expect(html).toContain('UPDATE_SEQ[blockId]');
      expect(html).toContain('APPLIED_SEQ[blockId]');
      // Валидация: не-OK статус и мусорное тело не трогают DOM
      expect(html).toContain('isValidBlockHtml');
      expect(html).toContain('if (!r.ok)');
      // Пачка hot-replace → одна ре-инициализация astro-событий
      expect(html).toContain('dispatchAstroNavEventsDebounced');
      // 106 T021: ветка add-block удалена; структурная вставка нового блока идёт
      // через reconnect-fetch, который так же валидирует фрагмент перед morph
      // (невалидный → id в missing → аварийный reload, а не вставка мусора).
      expect(html).toContain('html === null || !isValidBlockHtml(html, null)');
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

    it('update-tokens handler присутствует с per-theme allowlist', async () => {
      // Stage 2a N4: hot-replace tokens.css в iframe без full reload.
      // Symmetric to update-block — same per-theme allowlist (rose + vanilla).
      const html = await svc.renderPreviewPage({
        blocks: [{ type: 'Hero', props: { id: 'Hero-1' } }],
        tokensCss: ':root { --foo: 1 }',
        fontHead: '',
        themeId: 'rose',
      });
      expect(html).toContain("ev.data.type === 'update-tokens'");
      // 121b720: токены hot-replace для всех тем (allowlist удалён).
      expect(html).not.toContain("HOT_UPDATE_ALLOWED_THEMES_TOKENS");
      // Endpoint URL для fetch (через api-gateway proxy)
      expect(html).toContain('/preview/tokens-css');
      // Stable id для replacement target
      expect(html).toContain('__merfy_tokens_css');
    });

    it('renderPreviewPage emits <style id="__merfy_tokens_css"> tag', async () => {
      // The update-tokens handler replaces .textContent of this element;
      // missing id → handler is a no-op. Pin the id so renames break loudly.
      const html = await svc.renderPreviewPage({
        blocks: [{ type: 'Hero', props: { id: 'Hero-1' } }],
        tokensCss: ':root { --radius-button: 8px; }',
        fontHead: '',
        themeId: 'rose',
      });
      expect(html).toContain('<style id="__merfy_tokens_css">');
      expect(html).toContain('--radius-button: 8px');
    });
  });
});
