import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sha256 } from '@merfy/storefront-build';
import { afterEach, describe, expect, it } from 'vitest';
import { compileTemplate } from '../src/compile';
import {
  SectionRenderError,
  startSectionRenderer,
  withSectionRenderer,
  type RendererOptions,
  type SectionRenderer,
} from '../src/render';

const HERO = readFileSync(new URL('../fixtures/sections/hero/template.astro', import.meta.url), 'utf8');
const FRONT = '---\nconst { settings } = Astro.props;\n---\n';
const workerOf = (name: string) => fileURLToPath(new URL(`../fixtures/workers/${name}.mjs`, import.meta.url));
const SETTINGS = {
  heading: 'Шарфы к первым холодам',
  text: 'Кашемир и меринос',
  'button-label': 'Смотреть',
  'button-link': '/catalog',
  'heading-size': 'large',
};

async function moduleOf(template: string): Promise<{ module: string; hash: string }> {
  const compiled = await compileTemplate(template);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.problems));
  return { module: compiled.code, hash: sha256(Buffer.from(compiled.code, 'utf8')) };
}

const opened: SectionRenderer[] = [];
function open(options: RendererOptions = {}): SectionRenderer {
  const renderer = startSectionRenderer(options);
  opened.push(renderer);
  return renderer;
}

// Отказ рендера: стадия и текст. Ошибка без стадии — сбой процесса, не секции.
async function refusal(work: Promise<string>): Promise<{ stage: string | null; message: string }> {
  const error: unknown = await work.then(
    () => null,
    (reason: unknown) => reason,
  );
  const stage = error instanceof SectionRenderError ? error.stage : null;
  return { stage, message: error instanceof Error ? error.message : String(error) };
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((renderer) => renderer.close()));
});

describe('процесс рендера секций', () => {
  it('процесс запускается при первом рендере; HTML одинаковый от раза к разу', async () => {
    const renderer = open();
    expect(renderer.pid()).toBeNull();
    const hero = await moduleOf(HERO);
    const first = await renderer.render({ section: 'shop:hero', ...hero, settings: SETTINGS });
    expect(renderer.pid()).not.toBeNull();
    expect(first).toContain('Шарфы к первым холодам');
    expect(first).toContain('text-5xl');
    expect(await renderer.render({ section: 'shop:hero', ...hero, settings: SETTINGS })).toBe(first);
  }, 30_000);

  it('модуль уходит в процесс один раз на отпечаток', async () => {
    const renderer = open({ workerPath: workerOf('render-echo') });
    const request = { section: 'shop:hero', hash: 'sha256:a', module: 'x', settings: {} };
    expect(await renderer.render(request)).toBe('module');
    expect(await renderer.render(request)).toBe('no-module');
    expect(await renderer.render({ ...request, hash: 'sha256:b' })).toBe('module');
  }, 30_000);

  it('ошибка шаблона — отказ этого рендера со стадией render, процесс работает дальше', async () => {
    const renderer = open();
    const broken = await moduleOf(`${FRONT}<p>{settings.missing.deep}</p>`);
    expect((await refusal(renderer.render({ section: 'shop:broken', ...broken, settings: {} }))).stage).toBe('render');
    const hero = await moduleOf(HERO);
    expect(await renderer.render({ section: 'shop:hero', ...hero, settings: SETTINGS })).toContain('Шарфы');
  }, 30_000);

  it('чужой id или ответ без ключа процесса — процесс остановлен, рендер отклонён', async () => {
    const request = { section: 'shop:hero', hash: 'sha256:a', module: 'x', settings: {} };
    for (const name of ['render-forge', 'render-no-key']) {
      const renderer = open({ workerPath: workerOf(name) });
      expect(await refusal(renderer.render(request))).toEqual({
        stage: 'render',
        message: 'ответ процесса рендера не по форме',
      });
      expect(renderer.pid()).toBeNull();
    }
  }, 30_000);

  it('процесс не запустился — отказ без стадии: это сбой процесса, не секции', async () => {
    const renderer = open({ workerPath: workerOf('нет-такого') });
    const request = { section: 'shop:hero', hash: 'sha256:a', module: 'x', settings: {} };
    expect((await refusal(renderer.render(request))).stage).toBeNull();
  }, 30_000);

  it('withSectionRenderer отдаёт результат работы и закрывает процесс', async () => {
    const hero = await moduleOf(HERO);
    const html = await withSectionRenderer((render) => render({ section: 'shop:hero', ...hero, settings: SETTINGS }));
    expect(html).toContain('Шарфы к первым холодам');
  }, 30_000);
});

describe('пределы процесса рендера', () => {
  it('секция дольше срока — render-timeout; следующая секция — в свежем процессе', async () => {
    // Срок 1000 мс: следующая секция идёт в свежем процессе, и его холодный старт (импорт Astro,
    // контейнер) на медленном CI-раннере не укладывается в меньший срок — проверено на GitHub Actions.
    const renderer = open({ limits: { timeoutMs: 1_000 } });
    const endless = await moduleOf(`${FRONT}<p>{(() => { while (true) {} })()}</p>`);
    expect(await refusal(renderer.render({ section: 'shop:endless', ...endless, settings: {} }))).toEqual({
      stage: 'render-timeout',
      message: 'секция рендерилась дольше 1000 мс',
    });
    const hero = await moduleOf(HERO);
    expect(await renderer.render({ section: 'shop:hero', ...hero, settings: SETTINGS })).toContain('Шарфы');
  }, 30_000);

  it('ответ секции больше предела — render-output', async () => {
    const renderer = open({ limits: { sectionBytes: 1024 } });
    const huge = await moduleOf(`${FRONT}<p>{'шарф'.repeat(5000)}</p>`);
    expect(await refusal(renderer.render({ section: 'shop:huge', ...huge, settings: {} }))).toEqual({
      stage: 'render-output',
      message: 'ответ секции больше 1024 байт',
    });
  }, 30_000);

  it('куча кончилась — render-memory', async () => {
    // Небольшое превышение кучи (16 МБ + 20 МБ объектов): V8 отказывает быстро даже на медленном
    // CI-раннере, до срока секции — иначе вместо render-memory приходит render-timeout (GitHub Actions).
    const renderer = open({ limits: { memoryMb: 16, timeoutMs: 10_000 } });
    const greedy = await moduleOf(`${FRONT}<p>{Array.from({ length: 4e5 }, (_, i) => ({ i })).length}</p>`);
    expect((await refusal(renderer.render({ section: 'shop:greedy', ...greedy, settings: {} }))).stage).toBe(
      'render-memory',
    );
  }, 30_000);

  it('отказ прав процесса — render-denied; переменных окружения сборщика у процесса нет', async () => {
    process.env.MERFY_SANDBOX_PROBE = 'секрет';
    const renderer = open();
    const binding = await moduleOf(`${FRONT}<p>{String(process.binding('natives'))}</p>`);
    expect((await refusal(renderer.render({ section: 'shop:binding', ...binding, settings: {} }))).stage).toBe(
      'render-denied',
    );
    const env = await moduleOf(`${FRONT}<p>{String('MERFY_SANDBOX_PROBE' in process.env)}</p>`);
    expect(await renderer.render({ section: 'shop:env', ...env, settings: {} })).toBe('<p>false</p>');
    delete process.env.MERFY_SANDBOX_PROBE;
  }, 30_000);

  it('после limits.renders рендеров процесс заменяется свежим', async () => {
    const renderer = open({ limits: { renders: 2 } });
    const hero = await moduleOf(HERO);
    const request = { section: 'shop:hero', ...hero, settings: SETTINGS };
    await renderer.render(request);
    const first = renderer.pid();
    await renderer.render(request);
    expect(renderer.pid()).toBeNull();
    await renderer.render(request);
    expect([first, renderer.pid()].every((pid) => pid !== null)).toBe(true);
    expect(renderer.pid()).not.toBe(first);
  }, 30_000);
});
