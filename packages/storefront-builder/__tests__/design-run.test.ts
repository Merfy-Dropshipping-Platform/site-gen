import { describe, expect, it } from 'vitest';
import { capRaw, runDesign, type RunDeps } from '../src/design/design-run';
import type { StylePart } from '../src/design/design-style';
import { DesignError } from '../src/design/design-types';
import { dom } from '../src/design/tools/dom';
import { TAB_ORDER, type OutlineTool, type StyleTool, type TabUse } from '../src/design/tools/tool';
import { domBlock, fakeCaptured, fakeSession } from './design-fake';

// Оркестровка снятия без браузера: цепочки инструментов, дозаполнение, отказы, срок, содержимое своего сайта.

// expect.any возвращает any: через хелпер с типом unknown — без unsafe-assignment.
const anyNumber = (): unknown => expect.any(Number);

const FULL: StylePart = {
  bands: { value: [{ bg: '#ffffff', area: 1, top: 0 }], confidence: 0.7 },
  'fonts.heading': {
    value: { family: 'Inter', category: 'sans', weight: 700, cyrillic: true, source: 'google' },
    confidence: 0.8,
  },
  'fonts.body': {
    value: { family: 'Inter', category: 'sans', weight: 400, cyrillic: true, source: 'google' },
    confidence: 0.8,
  },
  'radius.button': { value: 8, confidence: 0.8 },
  'button.look': { value: 'filled', confidence: 0.8 },
};

function styleTool(
  name: string,
  part: StylePart | Error,
  calls: string[] = [],
  tab: TabUse = { order: TAB_ORDER.reads, limitMs: 30_000 },
): StyleTool {
  return {
    name,
    version: `${name}-1`,
    ...tab,
    raw: () => {
      calls.push(name);
      return part instanceof Error ? Promise.reject(part) : Promise.resolve({ from: name });
    },
    style: () => (part instanceof Error ? {} : part),
  };
}

const failingOutline: OutlineTool = {
  name: 'broken',
  version: '0',
  order: TAB_ORDER.reads,
  limitMs: 30_000,
  raw: () => Promise.reject(new Error('упал')),
  outline: () => ({ v: 1, blocks: [] }),
};

// Инструмент, который отвечает не раньше, чем через `ms`, а свой срок `budgetMs` соблюдает как настоящий (kill по сроку).
function slowTool(name: string, ms: number, tab: TabUse, calls: string[] = []): StyleTool {
  return {
    ...styleTool(name, FULL, calls, tab),
    raw: ({ budgetMs }) => {
      calls.push(name);
      return new Promise((resolve, reject) => {
        const late = budgetMs < ms;
        setTimeout(
          () => (late ? reject(new Error(`не уложился в ${budgetMs}`)) : resolve({ from: name })),
          Math.min(ms, budgetMs),
        );
      });
    },
  };
}

function deps(
  style: StyleTool[],
  outline: OutlineTool[],
  fields: Partial<RunDeps> = {},
): RunDeps & { session: ReturnType<typeof fakeSession> } {
  const session = fakeSession(
    fakeCaptured({
      dom: [domBlock({ tag: 'header' }), domBlock({ tag: 'footer', box: { x: 0, y: 900, w: 1366, h: 200 } })],
    }),
  );
  return { capture: () => Promise.resolve(session), style, outline, now: () => Date.now(), session, ...fields };
}

const input = { url: 'https://shop.example/', owned: false, deadline: Date.now() + 30_000 };

describe('снятие дизайна', () => {
  it('первый инструмент ответил всё — следующий не запускается; браузер закрыт', async () => {
    const calls: string[] = [];
    const run = deps([styleTool('a', FULL, calls), styleTool('b', FULL, calls)], [dom]);
    const snapshot = await runDesign(run, input);
    expect(calls).toEqual(['a']);
    expect(snapshot).toMatchObject({
      v: 1,
      ok: true,
      tool: 'a',
      toolVersion: 'a-1',
      outlineTool: 'dom',
      content: null,
    });
    expect(snapshot.style.finalUrl).toBe('https://shop.example/home');
    expect(snapshot.outline.blocks.map((block) => block.role)).toEqual(['header', 'footer']);
    const { ms, ...answers } = snapshot.raw;
    expect(answers).toEqual({ a: { from: 'a' }, dom: { blocks: 2 } });
    expect(ms).toEqual({ capture: anyNumber(), a: anyNumber(), dom: anyNumber() });
    expect(run.session.closed).toBe(1);
  });

  it('очередь на вкладке: свои скрипты → кто читает → кто меняет страницу; инструмент обеих цепочек — один раз', async () => {
    const calls: string[] = [];
    const changes = styleTool('changes', FULL, calls, { order: TAB_ORDER.changes, limitMs: 30_000 });
    const ownTool = styleTool('own', FULL, calls, { order: TAB_ORDER.own, limitMs: 1_000 });
    const reads = styleTool('reads', FULL, calls);
    const both: OutlineTool = { ...reads, outline: () => ({ v: 1, blocks: [] }) };
    const snapshot = await runDesign(deps([changes, ownTool], [both, dom]), input);
    expect(calls).toEqual(['own', 'reads', 'changes']);
    expect(snapshot.tool).toBe('changes');
    expect(snapshot.outlineTool).toBe('reads');
  });

  it('чужой инструмент не уложился в свой срок — стиль своим скриптом, задолго до срока задания', async () => {
    const hanging = slowTool('hanging', 10_000, { order: TAB_ORDER.changes, limitMs: 200 });
    const ownTool = styleTool('own', FULL, [], { order: TAB_ORDER.own, limitMs: 1_000 });
    const startedAt = Date.now();
    const snapshot = await runDesign(deps([hanging, ownTool], [dom]), { ...input, deadline: Date.now() + 20_000 });
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(snapshot.tool).toBe('own');
    expect(snapshot.raw.errors).toEqual({ hanging: 'не уложился в 200' });
  });

  it('содержимое своего сайта снимается до чужих инструментов: они меняют страницу', async () => {
    const order: string[] = [];
    const run = deps([styleTool('a', FULL, order)], [dom]);
    run.session.captured.evaluate = () => {
      order.push('content');
      return Promise.resolve({ logo: null, menu: [], blocks: [] });
    };
    await runDesign(run, { ...input, owned: true });
    expect(order).toEqual(['content', 'a']);
  });

  it('упал первый — запасной; ответил не всё — следующий дозаполняет', async () => {
    const calls: string[] = [];
    const partial: StylePart = { 'radius.button': { value: 20, confidence: 0.9 } };
    const run = deps(
      [styleTool('a', new Error('сломался'), calls), styleTool('b', partial, calls), styleTool('c', FULL, calls)],
      [failingOutline, dom],
    );
    const snapshot = await runDesign(run, input);
    expect(calls).toEqual(['a', 'b', 'c']);
    expect(snapshot.tool).toBe('b');
    expect(snapshot.style.radius.button).toBe(20);
    expect(snapshot.style.fonts.body.family).toBe('Inter');
    expect(snapshot.outlineTool).toBe('dom');
    expect(snapshot.raw.errors).toEqual({ a: 'сломался', broken: 'упал' });
  });

  it('поле снято наугад (одна полоса, уверенность 0,4) — следующий в цепочке уточняет', async () => {
    const calls: string[] = [];
    const guessed: StylePart = { ...FULL, bands: { value: [{ bg: '#eeeeee', area: 1, top: 0 }], confidence: 0.4 } };
    const run = deps([styleTool('a', guessed, calls), styleTool('b', FULL, calls)], [dom]);
    const snapshot = await runDesign(run, input);
    expect(calls).toEqual(['a', 'b']);
    expect(snapshot.tool).toBe('a');
    expect(snapshot.style.bands[0]?.bg).toBe('#ffffff');
  });

  it('все инструменты стиля упали или пусты — tool-failed', async () => {
    const run = deps([styleTool('a', new Error('нет')), styleTool('b', {})], [failingOutline]);
    await expect(runDesign(run, input)).rejects.toMatchObject({ code: 'tool-failed' });
    expect(run.session.closed).toBe(1);
  });

  it('контур не снялся никем — пустой контур, стиль есть', async () => {
    const snapshot = await runDesign(deps([styleTool('a', FULL)], [failingOutline]), input);
    expect(snapshot.outlineTool).toBe('none');
    expect(snapshot.outline).toEqual({ v: 1, blocks: [] });
  });

  it('свой сайт — содержимое по контуру; скрипт упал — пустое содержимое', async () => {
    const content = {
      logo: 'https://shop.example/l.png',
      menu: [],
      blocks: [{ heading: 'Шапка' }, { heading: 'Подвал' }],
    };
    const owned = deps([styleTool('a', FULL)], [dom]);
    owned.session.captured.evaluate = () => Promise.resolve(content);
    const snapshot = await runDesign(owned, { ...input, owned: true });
    expect(snapshot.content?.logo).toBe('https://shop.example/l.png');
    expect(snapshot.content?.blocks.map((block) => block.heading)).toEqual(['Шапка', 'Подвал']);
    const broken = deps([styleTool('a', FULL)], [dom]);
    broken.session.captured.evaluate = () => Promise.reject(new Error('страница закрыта'));
    expect((await runDesign(broken, { ...input, owned: true })).content).toEqual({
      v: 1,
      logo: null,
      menu: [],
      blocks: [],
    });
  });

  it('срок задания вышел во время снятия — timeout, браузер закрыт', async () => {
    const slow: StyleTool = {
      ...styleTool('slow', FULL),
      raw: () => new Promise((resolve) => setTimeout(resolve, 5_000)),
    };
    const run = deps([slow], [dom]);
    await expect(runDesign(run, { ...input, deadline: Date.now() + 2_300 })).rejects.toMatchObject({ code: 'timeout' });
    expect(run.session.closed).toBe(1);
  });

  it('срок вышел до захвата — timeout; поздний браузер закрывается, когда поднимется', async () => {
    const session = fakeSession();
    const run = deps([styleTool('a', FULL)], [dom], {
      capture: () => new Promise((resolve) => setTimeout(() => resolve(session), 150)),
    });
    await expect(runDesign(run, { ...input, deadline: Date.now() + 20 })).rejects.toBeInstanceOf(DesignError);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(session.closed).toBe(1);
  });

  it('срока на инструмент не осталось — инструмент не запускается', async () => {
    const calls: string[] = [];
    const run = deps([styleTool('a', FULL, calls)], [dom]);
    await expect(runDesign(run, { ...input, deadline: Date.now() + 1_500 })).rejects.toMatchObject({
      code: 'tool-failed',
    });
    expect(calls).toEqual([]);
  });

  it('захват отказал — его код наружу', async () => {
    const run = deps([styleTool('a', FULL)], [dom], {
      capture: () => Promise.reject(new DesignError('blocked', 'нельзя')),
    });
    await expect(runDesign(run, input)).rejects.toMatchObject({ code: 'blocked' });
  });
});

describe('предел сырых ответов', () => {
  it('самые тяжёлые заменяются отметкой, пока не влезет', () => {
    const raw = { big: 'x'.repeat(1_000), mid: 'y'.repeat(300), small: 'z' };
    expect(capRaw(raw, 400)).toEqual({ big: { truncated: true, bytes: 1_002 }, mid: 'y'.repeat(300), small: 'z' });
    expect(capRaw(raw, 10_000)).toEqual(raw);
  });
});
