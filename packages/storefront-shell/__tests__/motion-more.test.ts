import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIBRARIES, LIBRARY_LICENSES, LIBRARY_NAMES, isLibraryName } from '../src/core/behaviors/libraries';
import { behaviors } from '../src/core/behaviors/part';
import {
  PAGE_TRANSITIONS,
  PAGE_TRANSITION_SCRIPT,
  isPageTransition,
  pageTransitionCss,
} from '../src/core/behaviors/page-transition';
import type { InViewProvider, LibAdapter, ScrollProvider } from '../src/core/behaviors/types';
import { start, type StartedCore } from '../src/core/start';
import type { El, MotionLib } from '../src/core/types';
import { configTag, entry, placeSection, tick, watchFailures } from './core-support';

// 13.11, части 2б, 2в и 2д спеки анимаций в jsdom: каталог библиотек, ctx.scroll, ctx.inView и ctx.lib от части
// behaviors (провайдеры подставные; настоящие — motion-scroll.browser.test.ts), CSS и скрипт переходов между страницами.

// vitest запускается из папки пакета; URL файла в jsdom — не node-овский, поэтому путь от cwd.
const PACKAGE: unknown = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
const dependencyOf = (name: string): unknown =>
  typeof PACKAGE === 'object' && PACKAGE !== null ? Reflect.get(Reflect.get(PACKAGE, 'dependencies'), name) : null;

describe('каталог библиотек', () => {
  it('точная версия — та же, что в package.json; лицензия — MIT, ISC или Apache-2.0; файл адаптера lib-<имя>', () => {
    for (const name of LIBRARY_NAMES) {
      const spec = LIBRARIES[name];
      expect(dependencyOf(spec.package), name).toBe(spec.version);
      expect(spec.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(LIBRARY_LICENSES).toContain(spec.license);
      expect(spec.adapter).toBe(`lib-${name}`);
      expect(spec.budget).toBeGreaterThan(0);
    }
    expect(Object.keys(LIBRARIES)).toEqual([...LIBRARY_NAMES]);
    expect(isLibraryName('motion')).toBe(true);
    expect(isLibraryName('gsap')).toBe(false);
  });
});

const noop = (): void => undefined;
const fakeMotion: MotionLib = {
  timeline: () => ({ finished: Promise.resolve(), stop: noop, play: noop, pause: noop, time: 0 }),
  tween: () => ({ finished: Promise.resolve(), stop: noop, play: noop, pause: noop, time: 0 }),
  animate: () => ({ finished: Promise.resolve(), stop: noop, play: noop, pause: noop, time: 0 }),
};

describe('ctx.scroll, ctx.inView и ctx.lib от части behaviors', () => {
  let started: StartedCore | null = null;
  let failures: ReturnType<typeof watchFailures>;

  beforeEach(() => {
    document.head.innerHTML = configTag('live');
    failures = watchFailures();
  });

  afterEach(() => {
    started?.stop();
    started = null;
    failures.stop();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('провайдеры получают экземпляр (имя, область, сигнал, режим) и аргументы как есть', async () => {
    const scrolls: unknown[][] = [];
    const views: unknown[][] = [];
    const scroll: ScrollProvider = (host, ...args) => {
      scrolls.push([host.name, host.mode, host.signal.aborted, host.scope.nodeOf(args[0])?.tagName, ...args.slice(1)]);
      return noop;
    };
    const inView: InViewProvider = (host, ...args) => {
      views.push([host.name, ...args.slice(2)]);
      return noop;
    };
    const fn = (): void => undefined;
    placeSection('shop:a', 'a', '<p data-ref="box"></p>');
    started = start({
      parts: [behaviors({ list: [], scroll, inView })],
      sections: [
        entry('shop:a', {
          mount: (el, ctx) => {
            const box = el.ref('box');
            if (!box) return;
            ctx.scroll(box, fn, { offset: ['start end', 'end start'] });
            ctx.inView(box, fn, { once: true });
          },
        }),
      ],
    });
    await tick();
    expect(scrolls).toEqual([['shop:a', 'live', false, 'P', fn, { offset: ['start end', 'end start'] }]]);
    expect(views).toEqual([['shop:a', { once: true }]]);
    expect(failures.details).toEqual([]);
  });

  it.each([
    ['scroll', (el: El, ctx: { scroll: (e: El, f: () => void) => unknown }) => ctx.scroll(el, noop)],
    ['inView', (el: El, ctx: { inView: (e: El, f: () => void) => unknown }) => ctx.inView(el, noop)],
  ] as const)('ctx.%s без провайдера — сбой part-unknown с текстом для автора', async (name, call) => {
    placeSection('shop:a', 'a');
    started = start({
      parts: [behaviors({ list: [] })],
      sections: [entry('shop:a', { mount: (el, ctx) => void call(el, ctx) })],
    });
    await tick();
    expect(failures.details[0]?.message).toContain(`ctx.${name}: на странице нет кода анимаций`);
  });

  it('без части behaviors ctx.scroll, ctx.inView и ctx.lib.motion тоже бросают part-unknown', async () => {
    placeSection('shop:a', 'a');
    placeSection('shop:b', 'b');
    started = start({
      parts: [],
      sections: [
        entry('shop:a', { mount: (el, ctx) => void ctx.inView(el, noop) }),
        entry('shop:b', { mount: (_el, ctx) => void ctx.lib.motion.tween(0, 1, undefined, noop) }),
      ],
    });
    await tick();
    expect(failures.details.map((item) => item.message)).toEqual([
      expect.stringContaining('ctx.inView: на странице нет кода анимаций'),
      expect.stringContaining('ctx.lib: на странице нет кода анимаций'),
    ]);
  });

  it('ctx.lib — только библиотеки из uses секции; адаптер получает свой экземпляр', async () => {
    const hosts: string[] = [];
    const motion: LibAdapter<'motion'> = (host) => {
      hosts.push(host.name);
      return fakeMotion;
    };
    const seen: Record<string, string[]> = {};
    placeSection('shop:a', 'a');
    placeSection('shop:b', 'b');
    started = start({
      parts: [behaviors({ list: [], libs: { motion }, libUses: { 'shop:a': ['motion'] } })],
      sections: [
        entry('shop:a', { mount: (_el, ctx) => void (seen.a = Object.keys(ctx.lib)) }),
        entry('shop:b', { mount: (_el, ctx) => void (seen.b = Object.keys(ctx.lib)) }),
      ],
    });
    await tick();
    expect(seen).toEqual({ a: ['motion'], b: [] });
    expect(hosts).toEqual(['shop:a']);
    expect(failures.details).toEqual([]);
  });

  it('библиотека в uses, а адаптера нет на странице — чтение ctx.lib.<имя> — сбой part-unknown', async () => {
    placeSection('shop:a', 'a');
    started = start({
      parts: [behaviors({ list: [], libUses: { 'shop:a': ['motion'] } })],
      sections: [entry('shop:a', { mount: (_el, ctx) => void ctx.lib.motion.timeline([]) })],
    });
    await tick();
    expect(failures.details[0]?.message).toContain('ctx.lib.motion: на странице нет кода анимаций');
  });
});

describe('переходы между страницами', () => {
  it('none — без CSS; fade и slide — @view-transition под «без уменьшения движения»', () => {
    expect(PAGE_TRANSITIONS).toEqual(['none', 'fade', 'slide']);
    expect(pageTransitionCss('none')).toBe('');
    expect(pageTransitionCss('fade')).toBe(
      '@media (prefers-reduced-motion:no-preference){@view-transition{navigation:auto}}',
    );
    const slide = pageTransitionCss('slide');
    expect(slide.startsWith('@media (prefers-reduced-motion:no-preference){@view-transition{navigation:auto}')).toBe(
      true,
    );
    expect(slide).toContain('::view-transition-new(root)');
    expect(slide).toContain('@keyframes merfy-vt-in');
    expect(isPageTransition('fade')).toBe(true);
    expect(isPageTransition('zoom')).toBe(false);
  });

  it('скрипт имён — одно выражение без кавычек-апострофов (его хеш идёт в CSP, тест имён — в Chromium)', () => {
    expect(PAGE_TRANSITION_SCRIPT.startsWith('(()=>{')).toBe(true);
    expect(PAGE_TRANSITION_SCRIPT).not.toContain("'");
    expect(PAGE_TRANSITION_SCRIPT).not.toContain('</script');
  });
});
