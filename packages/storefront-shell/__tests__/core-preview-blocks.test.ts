import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineSection } from '../src/core/define';
import {
  BLOCK_DESELECT_EVENT,
  BLOCK_SELECT_EVENT,
  PREVIEW_REPLACE_EVENT,
  type PreviewReplaceDetail,
  type ReplaceOutcome,
} from '../src/core/preview-protocol';
import { watchPreviewReplace } from '../src/core/replace';
import { start, type StartedCore } from '../src/core/start';
import type { Json, Mode, SdkPart, SectionDef, SectionEntry } from '../src/core/types';
import { configTag, entry, hash, inputTag, placeSection, watchFailures } from './core-support';

// Превью и поведения (блок 6 «Секций и SDK», часть 6в): замена экземпляра переносит состояние поведений через save и
// restore части behaviors; выбор блока в панели слева — события merfy:block:select и merfy:block:deselect только
// экземпляру своей секции.
let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;

beforeEach(() => {
  failures = watchFailures();
});

afterEach(() => {
  core?.stop();
  core = undefined;
  failures.stop();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

const CODE = { hash: hash('a'), uses: [] }; // hash строки списка бандла по умолчанию (entry в core-support)

interface KeepStub {
  readonly animate: null;
  save(sectionId: string): Json | null;
  restore(sectionId: string, state: Json): void;
}

// Часть behaviors для теста: журнал attach, снятия, save и restore; save отдаёт saved, а с fails — бросает.
function behaviorsStub(log: string[], saved: Json = { index: 2 }, fails = false): SdkPart<'behaviors', KeepStub> {
  return {
    name: 'behaviors',
    create: () => ({
      animate: null,
      save: (id) => {
        log.push(`save ${id}`);
        if (fails) throw new Error('save сломался');
        return saved;
      },
      restore: (id, state) => void log.push(`restore ${id} ${JSON.stringify(state)}`),
    }),
    attach: (_api, host) => {
      log.push(`attach ${host.id}`);
      host.signal.addEventListener('abort', () => void log.push(`снят ${host.id}`), { once: true });
    },
  };
}

// «Слайд-шоу»: слайдер с двумя блоками-слайдами и тег входных данных.
const slidesBody = (title: string): string =>
  `<div data-behavior="carousel"><p data-merfy-block="slide-1">${title}</p><p data-merfy-block="slide-2">Кашемир</p></div>` +
  inputTag({ settings: { title }, blocks: [], data: {} });

const slidesHtml = (id: string, title: string): string =>
  `<merfy-section data-section="shop:slides" data-section-id="${id}">${slidesBody(title)}</merfy-section>`;

function sectionOf(id: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(`merfy-section[data-section-id="${id}"]`);
  if (node === null) throw new Error(`нет секции ${id}`);
  return node;
}

// Замена — как её отправляет скрипт превью; script null — секция без кода.
function replace(
  id: string,
  title: string,
  script: PreviewReplaceDetail['script'] = null,
): Promise<ReplaceOutcome | 'not-handled'> {
  return new Promise((resolve) => {
    const detail: PreviewReplaceDetail = {
      html: slidesHtml(id, title),
      script,
      codeOnly: false,
      load: () => Promise.reject(new Error('код не загружали')),
      reply: (outcome) => resolve(outcome),
    };
    const event = new CustomEvent(PREVIEW_REPLACE_EVENT, { bubbles: true, cancelable: true, detail });
    if (sectionOf(id).dispatchEvent(event)) resolve('not-handled');
  });
}

// Страница превью (или витрины) с «Слайд-шоу» в экземплярах ids.
function open(
  parts: SdkPart<string, unknown>[],
  sections: SectionEntry[] = [],
  ids = ['hero'],
  mode: Mode = 'preview',
) {
  document.head.innerHTML = configTag(mode);
  ids.forEach((id) => placeSection('shop:slides', id, slidesBody('Шарфы к первым холодам')));
  core = start({ parts, sections, preview: watchPreviewReplace });
}

describe('замена в превью: состояние поведений', () => {
  it('save — до снятия прежнего экземпляра, restore — новому после attach; итог тот же, что без поведений', async () => {
    const log: string[] = [];
    open([behaviorsStub(log)]);
    expect(await replace('hero', 'Новые шарфы')).toBe('fresh');
    expect(log).toEqual(['attach hero', 'save hero', 'снят hero', 'attach hero', 'restore hero {"index":2}']);
    expect(sectionOf('hero').textContent).toContain('Новые шарфы');
  });

  it('три замены подряд — каждая переносит состояние один раз', async () => {
    const log: string[] = [];
    open([behaviorsStub(log)]);
    for (const title of ['Раз', 'Два', 'Три']) expect(await replace('hero', title)).toBe('fresh');
    expect(log.filter((line) => line.startsWith('save'))).toHaveLength(3);
    expect(log.filter((line) => line.startsWith('restore'))).toHaveLength(3);
    expect(log.at(-1)).toBe('restore hero {"index":2}');
  });

  it('save отдал null — restore нет; части behaviors нет — замена как раньше', async () => {
    const log: string[] = [];
    open([behaviorsStub(log, null)]);
    expect(await replace('hero', 'Новые шарфы')).toBe('fresh');
    expect(log).toEqual(['attach hero', 'save hero', 'снят hero', 'attach hero']);
    core?.stop();
    document.body.replaceChildren();
    open([]);
    expect(await replace('hero', 'Без поведений')).toBe('fresh');
    expect(sectionOf('hero').textContent).toContain('Без поведений');
  });

  it('save бросил — строка в консоли, замена идёт дальше', async () => {
    const log: string[] = [];
    open([behaviorsStub(log, null, true)]);
    expect(await replace('hero', 'Новые шарфы')).toBe('fresh');
    expect(log).toEqual(['attach hero', 'save hero', 'снят hero', 'attach hero']);
    expect(failures.consoleError).toHaveBeenCalledWith('Поведения секции #hero, save: save сломался');
  });

  it('ошибка mount с ctx.state — вторая попытка без состояния поведений', async () => {
    const log: string[] = [];
    const picky: SectionDef = defineSection({
      mount(_el, ctx) {
        if (ctx.state.started === true) throw new Error('второй запуск с состоянием');
        ctx.state.started = true;
      },
    });
    open([behaviorsStub(log)], [entry('shop:slides', picky)]);
    expect(await replace('hero', 'Новые шарфы', CODE)).toBe('fresh');
    expect(log.filter((line) => line.startsWith('restore'))).toEqual(['restore hero {"index":2}']);
    expect(log.filter((line) => line.startsWith('attach'))).toHaveLength(3);
  });
});

// Секция, которая пишет в журнал события выбора блока со своим id.
function listening(log: string[]): SectionDef {
  return defineSection({
    mount(_el, ctx) {
      ctx.listen('merfy:block:select', (detail) => void log.push(`${ctx.id} select ${detail.blockId}`));
      ctx.listen('merfy:block:deselect', (detail) => void log.push(`${ctx.id} deselect ${detail.blockId}`));
    },
  });
}

function blockOf(sectionId: string, blockId: string): HTMLElement {
  const node = sectionOf(sectionId).querySelector<HTMLElement>(`[data-merfy-block="${blockId}"]`);
  if (node === null) throw new Error(`нет блока ${blockId}`);
  return node;
}

const send = (target: EventTarget, name: string, detail: unknown): boolean =>
  target.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));

describe('события превью «выбран блок» и «выбор снят»', () => {
  it('событие на узле блока — только подпискам своей секции, с blockId', () => {
    const log: string[] = [];
    open([], [entry('shop:slides', listening(log))], ['hero', 'other']);
    send(blockOf('hero', 'slide-2'), BLOCK_SELECT_EVENT, { blockId: 'slide-2' });
    send(blockOf('hero', 'slide-2'), BLOCK_DESELECT_EVENT, { blockId: 'slide-2' });
    send(sectionOf('other'), BLOCK_SELECT_EVENT, { blockId: 'slide-1' });
    expect(log).toEqual(['hero select slide-2', 'hero deselect slide-2', 'other select slide-1']);
  });

  it('данные не по каталогу, узел вне секции, событие на document — без доставки', () => {
    const log: string[] = [];
    open([], [entry('shop:slides', listening(log))]);
    send(blockOf('hero', 'slide-2'), BLOCK_SELECT_EVENT, {});
    send(blockOf('hero', 'slide-2'), BLOCK_SELECT_EVENT, { blockId: 'slide-2', index: 1 });
    send(document.body, BLOCK_SELECT_EVENT, { blockId: 'slide-2' });
    send(document, BLOCK_SELECT_EVENT, { blockId: 'slide-2' });
    expect(log).toEqual([]);
  });

  it('опубликованный сайт — слушателя нет: секция событий не получает', () => {
    const log: string[] = [];
    open([], [entry('shop:slides', listening(log))], ['hero'], 'live');
    send(blockOf('hero', 'slide-2'), BLOCK_SELECT_EVENT, { blockId: 'slide-2' });
    expect(log).toEqual([]);
  });

  it('после замены событие получает только новый экземпляр', async () => {
    const log: string[] = [];
    open([], [entry('shop:slides', listening(log))]);
    expect(await replace('hero', 'Новые шарфы', CODE)).toBe('fresh');
    send(blockOf('hero', 'slide-1'), BLOCK_SELECT_EVENT, { blockId: 'slide-1' });
    expect(log).toEqual(['hero select slide-1']);
  });
});
