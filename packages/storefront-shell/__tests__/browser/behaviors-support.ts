import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { EASINGS } from '../../src/core/behaviors/catalog';
import { MOTION_CSS, MOTION_HEAD_SCRIPT } from '../../src/core/behaviors/motion-css';
import type { EasingName, Mode } from '../../src/core/types';
import { configTag } from '../core-support';

// Страница с ядром 5а и частью behaviors для тестов Chromium (design.md блока 6, раздел «Как проверяем»). Бандл —
// из исходников TS, как его соберёт часть 6б: start, часть behaviors с нужными поведениями, модули секций без
// defineSection. Адрес — https://shop.test: page.route отдаёт HTML и бандл без сервера, у страницы настоящий origin.
const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url));
const CORE = fileURLToPath(new URL('../../src/core/index.ts', import.meta.url));
const BEHAVIORS = fileURLToPath(new URL('../../src/core/behaviors/index.ts', import.meta.url));
export const ORIGIN = 'https://shop.test';

export type BehaviorExport =
  | 'accordion'
  | 'dialog'
  | 'carousel'
  | 'tabs'
  | 'navMenu'
  | 'quantity'
  | 'cardPhotos'
  | 'stickyHeader'
  | 'video';

export interface SectionModule {
  readonly name: string;
  readonly code: string; // модуль секции: export default { mount(el, ctx) { … } }
}

export interface PageOptions {
  readonly body: string;
  readonly behaviors?: readonly BehaviorExport[];
  readonly reveal?: boolean;
  readonly animate?: boolean;
  readonly sections?: readonly SectionModule[];
  readonly mode?: Mode;
  readonly reducedMotion?: boolean;
  readonly motionReveal?: boolean; // <html data-motion-reveal="on"> — выбор choice-motion-reveal
  readonly headScript?: boolean; // MOTION_HEAD_SCRIPT и MOTION_CSS в <head>, как их встроит сборка 6б
  readonly css?: string;
  readonly beforeCore?: string; // обычный скрипт до бандла: заглушки браузера
  readonly withoutCore?: boolean; // страница без бандла — проверка запасного CSS
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly preview?: boolean; // бандл превью (часть 6в): start получает preview: watchPreviewReplace; с mode: 'preview'
}

// Сведения об анимациях WAAPI одного элемента: Motion заводит по анимации на свойство, здесь они сведены вместе.
export interface AnimationInfo {
  readonly count: number;
  readonly duration: number;
  readonly delay: number;
  readonly easing: readonly number[];
  readonly running: boolean;
  readonly first: Readonly<Record<string, string>>;
  readonly last: Readonly<Record<string, string>>;
}

interface RawAnimation {
  readonly duration: number;
  readonly delay: number;
  readonly easing: string;
  readonly running: boolean;
  readonly first: Record<string, string>;
  readonly last: Record<string, string>;
}

declare global {
  interface Window {
    __ready?: boolean;
    __finished?: boolean;
    __counts?: { input: number; change: number };
    __behaviorsApi?: {
      save(sectionId: string): unknown;
      restore(sectionId: string, state: unknown): void;
    };
    __readAnimations?: (selector: string, pseudo: string | null) => RawAnimation[][];
  }
}

const sectionsPlugin = (sections: readonly SectionModule[]): Plugin => ({
  name: 'sections',
  setup(context) {
    context.onResolve({ filter: /^section:\d+$/ }, (args) => ({ path: args.path, namespace: 'section' }));
    context.onLoad({ filter: /.*/, namespace: 'section' }, (args) => ({
      contents: sections[Number(args.path.slice('section:'.length))]?.code ?? '',
      loader: 'js',
      resolveDir: PACKAGE_DIR,
    }));
  },
});

export async function pageBundle(options: PageOptions): Promise<string> {
  const list = options.behaviors ?? [];
  const sections = options.sections ?? [];
  const extra = [...(options.reveal ? ['reveal'] : []), ...(options.animate ? ['animate'] : [])];
  const rows = sections.map(
    (section, index) =>
      `{ name: ${JSON.stringify(section.name)}, kind: 'section', script: '${'a'.repeat(64)}', uses: [], definition: s${index} }`,
  );
  const preview = options.preview === true;
  const entry = [
    `import { start${preview ? ', watchPreviewReplace' : ''} } from ${JSON.stringify(CORE)};`,
    `import { ${['behaviors', ...list, ...extra].join(', ')} } from ${JSON.stringify(BEHAVIORS)};`,
    ...sections.map((_section, index) => `import s${index} from 'section:${index}';`),
    `const base = behaviors({ list: [${list.join(', ')}]${extra.map((name) => `, ${name}`).join('')} });`,
    'const part = { ...base, create: (core) => (window.__behaviorsApi = base.create(core)) };',
    `start({ parts: [part], sections: [${rows.join(', ')}]${preview ? ', preview: watchPreviewReplace' : ''} });`,
    'window.__ready = true;',
  ].join('\n');
  const result = await build({
    stdin: { contents: entry, resolveDir: PACKAGE_DIR, loader: 'js' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
    plugins: [sectionsPlugin(sections)],
  });
  return result.outputFiles[0]?.text ?? '';
}

export function pageHtml(options: PageOptions): string {
  const head = [
    '<meta charset="utf-8">',
    configTag(options.mode ?? 'live'),
    // Геометрические проверки (верх немодального окна, появления) считают от края окна: у страницы тестов нет отступа.
    '<style>body{margin:0}</style>',
    options.headScript ? `<script>${MOTION_HEAD_SCRIPT}</script><style>${MOTION_CSS}</style>` : '',
    options.css ? `<style>${options.css}</style>` : '',
    options.beforeCore ? `<script>${options.beforeCore}</script>` : '',
    options.withoutCore ? '' : '<script type="module" src="/page.js"></script>',
  ].join('');
  const reveal = options.motionReveal ? ' data-motion-reveal="on"' : '';
  return `<!doctype html><html lang="ru"${reveal}><head>${head}</head><body>${options.body}</body></html>`;
}

// Чтение анимаций в странице: по элементам селектора, по порядку документа; pseudo — '::backdrop' или null. Строкой,
// а не функцией: сборка теста не добавит в неё своих помощников.
const READER = `
window.__readAnimations = (selector, pseudo) => {
  const skip = ['offset', 'computedOffset', 'easing', 'composite'];
  const frame = (f) => Object.fromEntries(Object.entries(f || {}).filter(([k]) => !skip.includes(k)).map(([k, v]) => [k, String(v)]));
  return [...document.querySelectorAll(selector)].map((element) =>
    document.getAnimations()
      .filter((a) => a.effect instanceof KeyframeEffect && a.effect.target === element && (a.effect.pseudoElement || null) === pseudo)
      .map((a) => {
        const timing = a.effect.getTiming();
        const frames = a.effect.getKeyframes();
        return { duration: Number(timing.duration), delay: Number(timing.delay), easing: String(timing.easing),
          running: a.playState === 'running', first: frame(frames[0]), last: frame(frames[frames.length - 1]) };
      }));
};`;

const KEYWORDS: Readonly<Record<string, readonly number[]>> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

function curveOf(easing: string): readonly number[] {
  const match = /^cubic-bezier\(([^)]+)\)$/.exec(easing);
  if (match?.[1]) return match[1].split(',').map(Number);
  return KEYWORDS[easing] ?? [];
}

export const curve = (name: EasingName): readonly number[] => EASINGS[name];

function merge(list: readonly RawAnimation[]): AnimationInfo | null {
  const head = list[0];
  if (!head) return null;
  const first: Record<string, string> = {};
  const last: Record<string, string> = {};
  for (const item of list) {
    Object.assign(first, item.first);
    Object.assign(last, item.last);
  }
  return {
    count: list.length,
    duration: head.duration,
    delay: head.delay,
    easing: curveOf(head.easing),
    running: list.some((item) => item.running),
    first,
    last,
  };
}

// Анимации элементов селектора сейчас; у элемента без анимаций — null.
export async function animations(
  page: Page,
  selector: string,
  pseudo: string | null = null,
): Promise<(AnimationInfo | null)[]> {
  const raw = await page.evaluate(([s, p]) => window.__readAnimations?.(s, p) ?? [], [selector, pseudo] as const);
  return raw.map(merge);
}

// Нажатие и чтение анимаций в одной задаче: обработчик поведения запускает анимацию синхронно, тест видит её сразу.
export async function clickAndRead(page: Page, target: string, selector: string, pseudo: string | null = null) {
  const raw = await page.evaluate(
    ([t, s, p]) => {
      const element = document.querySelector(t);
      if (!(element instanceof HTMLElement)) throw new Error(`нет элемента ${t}`);
      element.click();
      return window.__readAnimations?.(s, p) ?? [];
    },
    [target, selector, pseudo] as const,
  );
  return raw.map(merge);
}

export interface OpenedPage {
  readonly page: Page;
  readonly errors: string[]; // console.error и необработанные исключения страницы
}

export async function openPage(browser: Browser, options: PageOptions): Promise<OpenedPage> {
  const page = await browser.newPage({ viewport: options.viewport ?? { width: 1280, height: 800 } });
  if (options.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript({ content: READER });
  const bundle = options.withoutCore ? '' : await pageBundle(options);
  const html = pageHtml(options);
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    if (path === '/page.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto(`${ORIGIN}/`);
  if (!options.withoutCore) await page.waitForFunction(() => window.__ready === true);
  return { page, errors };
}

// Два кадра: обработчики rAF поведений (Embla, наблюдатели) успели отработать.
export const frames = (page: Page): Promise<void> =>
  page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
