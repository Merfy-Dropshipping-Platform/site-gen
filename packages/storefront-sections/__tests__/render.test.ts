import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sha256 } from '@merfy/storefront-build';
import { afterEach, describe, expect, it } from 'vitest';
import { compileTemplate } from '../src/compile';
import { startSectionRenderer, withSectionRenderer, type SectionRenderer } from '../src/render';

const HERO = readFileSync(new URL('../fixtures/sections/hero/template.astro', import.meta.url), 'utf8');
const workerOf = (name: string) => fileURLToPath(new URL(`../fixtures/workers/${name}.ts`, import.meta.url));
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
function open(workerPath?: string): SectionRenderer {
  const renderer = startSectionRenderer(workerPath === undefined ? {} : { workerPath });
  opened.push(renderer);
  return renderer;
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
    const renderer = open(workerOf('render-echo'));
    const request = { section: 'shop:hero', hash: 'sha256:a', module: 'x', settings: {} };
    expect(await renderer.render(request)).toBe('module');
    expect(await renderer.render(request)).toBe('no-module');
    expect(await renderer.render({ ...request, hash: 'sha256:b' })).toBe('module');
  }, 30_000);

  it('ошибка шаблона — отказ этого рендера, процесс работает дальше', async () => {
    const renderer = open();
    const broken = await moduleOf('---\nconst { settings } = Astro.props;\n---\n<p>{settings.missing.deep}</p>');
    await expect(renderer.render({ section: 'shop:broken', ...broken, settings: {} })).rejects.toThrow();
    const hero = await moduleOf(HERO);
    expect(await renderer.render({ section: 'shop:hero', ...hero, settings: SETTINGS })).toContain('Шарфы');
  }, 30_000);

  it('чужой ответ — процесс остановлен, ждущий рендер отклонён', async () => {
    const renderer = open(workerOf('render-forge'));
    const request = { section: 'shop:hero', hash: 'sha256:a', module: 'x', settings: {} };
    await expect(renderer.render(request)).rejects.toThrow('ответ процесса рендера не по форме');
    expect(renderer.pid()).toBeNull();
  }, 30_000);

  it('withSectionRenderer отдаёт результат работы и закрывает процесс', async () => {
    const hero = await moduleOf(HERO);
    const html = await withSectionRenderer((render) => render({ section: 'shop:hero', ...hero, settings: SETTINGS }));
    expect(html).toContain('Шарфы к первым холодам');
  }, 30_000);
});
