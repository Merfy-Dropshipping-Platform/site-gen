import { fileURLToPath } from 'node:url';
import { sha256, type SettingValues } from '@merfy/storefront-build';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { readManifest, type SectionManifest } from '../src/format';
import { readSectionFolder } from '../src/read-folder';
import { startSectionRenderer, type SectionRenderer } from '../src/render';
import { prepareInWorker } from '../src/sandbox';

// «Видео» — сводная секция пяти тем (базовые секции, 29.10): панель прода в её порядке (видео, положение, размер,
// «Содержание», цветовая схема, отступы), новые параметры — после, в группах «Вид» и «Воспроизведение»; раскладка и
// воспроизведение — признаками data-* на корне и атрибутами тега video.
const FOLDER = fileURLToPath(new URL('../fixtures/shop/video', import.meta.url));
const FILE = 'https://s3.merfy.ru/media/site/clip.mp4';
const POSTER = 'https://s3.merfy.ru/media/site/poster.jpg';

let manifest: SectionManifest;
let module: string;
let hash: string;
let renderer: SectionRenderer;

beforeAll(async () => {
  const files = await readSectionFolder(FOLDER);
  const read = readManifest(files);
  if (!read.ok) throw new Error(JSON.stringify(read.problems));
  manifest = read.value;
  const checked = await checkTemplate(files['template.astro'] ?? '', templateOptionsOf(manifest));
  if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
  module = checked.render;
  hash = sha256(Buffer.from(module, 'utf8'));
  renderer = startSectionRenderer();
});

afterAll(async () => {
  await renderer.close();
});

const DEFAULTS: SettingValues = {
  video: FILE,
  layout: 'window',
  height: 'medium',
  heading: 'Видео о магазине',
  subheading: '',
  'heading-size': 'medium',
  align: 'left',
  capitals: false,
  'text-style': 'normal',
  overlay: 0,
  poster: '',
  'video-autoplay': false,
  'video-muted': false,
  'video-loop': false,
};
const html = (settings: SettingValues = {}): Promise<string> =>
  renderer.render({ section: 'shop:video', hash, module, settings: { ...DEFAULTS, ...settings }, blocks: [], theme: {} });
const attr = (source: string, name: string): string | null => new RegExp(`\\sdata-${name}="([^"]*)"`).exec(source)?.[1] ?? null;
const videoTag = (source: string): string => /<video\b[^>]*>/.exec(source)?.[0] ?? '';
const playTag = (source: string): string => /<button\b[^>]*data-part="play"[^>]*>/.exec(source)?.[0] ?? '';
const fields = () => manifest.settings.flatMap((entry) => ('wrapper' in entry ? [] : [entry]));
const order = (): string[] => manifest.settings.map((entry) => ('wrapper' in entry ? `wrapper:${entry.wrapper}` : entry.id));
const groupOf = (id: string): string | undefined => fields().find((field) => field.id === id)?.section;

describe('приём: без проблем и предупреждений', () => {
  it('video', async () => {
    const result = await prepareInWorker({ prefix: 'shop', files: await readSectionFolder(FOLDER) });
    expect(result.ok ? result.section.warnings : result.problems).toEqual([]);
  }, 30_000);
});

describe('панель: поля прода в их порядке, новые — после, в группах «Вид» и «Воспроизведение»', () => {
  it('порядок полей и подписи', () => {
    expect(order()).toEqual([
      'video',
      'layout',
      'height',
      'heading',
      'subheading',
      'heading-size',
      'wrapper:scheme',
      'wrapper:padding',
      'align',
      'capitals',
      'text-style',
      'overlay',
      'poster',
      'video-autoplay',
      'video-muted',
      'video-loop',
    ]);
    expect(fields().map((field) => field.label)).toEqual([
      'Видео',
      'Положение видео',
      'Размер',
      'Заголовок',
      'Подзаголовок',
      'Размер заголовка',
      'Выравнивание',
      'Заглавные буквы',
      'Стиль текста',
      'Затемнение',
      'Обложка',
      'Автозапуск',
      'Без звука',
      'Повтор',
    ]);
  });

  it('группы: «Содержание» с заголовка, «Вид» с выравнивания, «Воспроизведение» с обложки', () => {
    expect(groupOf('heading')).toBe('Содержание');
    expect(groupOf('align')).toBe('Вид');
    expect(groupOf('poster')).toBe('Воспроизведение');
    expect(groupOf('video')).toBeUndefined();
  });

  it('видео — файл до 50 МБ, обложка — картинка до 30 МБ, как на проде', () => {
    const spec = (id: string) => fields().find((field) => field.id === id)?.setting;
    expect(spec('video')).toMatchObject({ kind: 'video', default: '', maxBytes: 50 * 1024 * 1024 });
    expect(spec('poster')).toMatchObject({ kind: 'image', maxBytes: 30 * 1024 * 1024 });
  });

  it('заголовок и подзаголовок — с ИИ; «Без звука» видно при выключенном автозапуске', () => {
    const spec = (id: string) => fields().find((field) => field.id === id);
    expect(spec('heading')?.setting).toMatchObject({ kind: 'string', ai: 'title' });
    expect(spec('subheading')?.setting).toMatchObject({ kind: 'string', ai: 'description' });
    expect(spec('video-muted')?.visibleWhen).toEqual({ setting: 'video-autoplay', equals: false });
  });

  it('положение: «На весь экран», «Окно»; по умолчанию окно, как у flux', () => {
    const layout = fields().find((field) => field.id === 'layout')?.setting;
    expect(layout).toMatchObject({
      kind: 'radio',
      default: 'window',
      options: [
        { value: 'fullscreen', label: 'На весь экран' },
        { value: 'window', label: 'Окно' },
      ],
    });
  });
});

describe('плеер', () => {
  it('файл задан — тег video с адресом, кнопка «Смотреть» видна, звук и повтор выключены', async () => {
    const source = await html();
    const video = videoTag(source);
    expect(video).toContain(`src="${FILE}"`);
    expect(video).toContain(' controls');
    expect(video).toContain(' playsinline');
    expect(video).toContain('preload="metadata"');
    expect(video).not.toMatch(/\s(autoplay|muted|loop)[\s>=]/);
    expect(video).not.toContain('poster');
    expect(playTag(source)).not.toContain(' hidden');
    expect(playTag(source)).toContain('aria-label="Смотреть видео"');
  });

  it('поведение video: на плитке с видео и кнопкой, части video и play', async () => {
    const source = await html();
    expect(source).toMatch(/<div[^>]*data-behavior="video"/);
    expect(videoTag(source)).toContain('data-part="video"');
    expect(playTag(source)).toContain('data-part="play"');
  });

  it('обложка — атрибут poster видео', async () => {
    expect(videoTag(await html({ poster: POSTER }))).toContain(`poster="${POSTER}"`);
  });

  it('автозапуск — autoplay и muted, кнопка скрыта с самого начала, preload auto', async () => {
    const source = await html({ 'video-autoplay': true });
    const video = videoTag(source);
    expect(video).toMatch(/\sautoplay[\s>=]/);
    expect(video).toMatch(/\smuted[\s>=]/);
    expect(video).toContain('preload="auto"');
    expect(playTag(source)).toContain(' hidden');
  });

  it('«Без звука» без автозапуска — только muted', async () => {
    const video = videoTag(await html({ 'video-muted': true }));
    expect(video).toMatch(/\smuted[\s>=]/);
    expect(video).not.toMatch(/\sautoplay[\s>=]/);
  });

  it('«Повтор» — loop', async () => {
    expect(videoTag(await html({ 'video-loop': true }))).toMatch(/\sloop[\s>=]/);
  });

  it('файла нет — тега video и кнопки нет, остаётся плитка со значком; обложка выводится картинкой', async () => {
    const empty = await html({ video: '' });
    expect(empty).not.toContain('<video');
    expect(empty).not.toContain('data-part="play"');
    expect(empty).toContain('<svg');
    expect(empty).not.toContain('<img');
    const withPoster = await html({ video: '', poster: POSTER });
    expect(withPoster).toContain(`<img src="${POSTER}"`);
  });

  it('тега iframe нет: чужие плееры не встраиваются', async () => {
    expect(await html({ video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })).not.toContain('<iframe');
  });
});

describe('вид', () => {
  it.each(['window', 'fullscreen'])('положение %s — признак на корне', async (layout) => {
    expect(attr(await html({ layout }), 'layout')).toBe(layout);
  });

  it.each(['small', 'medium', 'large'])('размер %s — признак на корне', async (height) => {
    expect(attr(await html({ height }), 'height')).toBe(height);
  });

  it.each([
    ['align', 'center', 'align'],
    ['align', 'right', 'align'],
    ['text-style', 'italic', 'text-style'],
    ['capitals', true, 'capitals'],
  ])('%s=%s — признак %s на корне', async (id, value, name) => {
    expect(attr(await html({ [id]: value }), name)).toBe(String(value));
  });

  it('затемнение — слой поверх видео с классом непрозрачности и без перехвата кликов', async () => {
    const source = await html({ overlay: 40 });
    expect(source).toMatch(/class="[^"]*pointer-events-none[^"]*bg-custom-scrim[^"]*opacity-40/);
  });

  it('заголовок и подзаголовок с начертаниями; размер заголовка — признаком', async () => {
    const source = await html({ heading: 'О <em>магазине</em>', subheading: 'Смотрите <strong>ролик</strong>', 'heading-size': 'large' });
    expect(source).toContain('<em>магазине</em>');
    expect(source).toContain('<strong>ролик</strong>');
    expect(attr(source, 'heading-size')).toBe('large');
  });

  it('пустые заголовок и подзаголовок — шапки нет, плеер на месте', async () => {
    const source = await html({ heading: '', subheading: '' });
    expect(source).not.toContain('<h2');
    expect(source).not.toContain('<p ');
    expect(source).toContain('<video');
  });
});
