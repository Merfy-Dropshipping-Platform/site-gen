import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineSection } from '../src/core/define';
import { overlay } from '../src/core/parts/overlay';
import { OVERLAY_HIDE_EVENT, OVERLAY_SHOW_EVENT } from '../src/core/preview-protocol';
import { OVERLAY_ATTRIBUTE } from '../src/core/roles';
import { lockScroll, unlockScroll } from '../src/core/scroll-lock';
import { start, type StartedCore } from '../src/core/start';
import type { BaseCtx, Mode, OverlayOptions, OverlayWindow } from '../src/core/types';
import { configTag, entry, placeSection, tick, watchFailures } from './core-support';

// Окна поверх страницы (01.11): ctx.overlay у секции с data-overlay, параметры open(), одно модальное и одно угловое
// окно, Esc, клик мимо окна, overlay.close, фокус, запрет прокрутки, превью. В jsdom нет popover — showPopover и
// hidePopover подставлены пустыми; верхний слой, Tab по кругу и анимации — в browser/overlay.browser.test.ts.
let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;
const closed: unknown[] = [];
const onClose = (event: Event): void => void closed.push(event instanceof CustomEvent ? event.detail : null);

beforeEach(() => {
  failures = watchFailures();
  closed.length = 0;
  document.addEventListener('merfy:overlay:close', onClose);
  Reflect.set(HTMLElement.prototype, 'showPopover', () => undefined);
  Reflect.set(HTMLElement.prototype, 'hidePopover', () => undefined);
});

afterEach(() => {
  core?.stop();
  core = undefined;
  failures.stop();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
  Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
  document.removeEventListener('merfy:overlay:close', onClose);
  document.documentElement.style.overflow = '';
  document.head.replaceChildren();
  document.body.replaceChildren();
});

// Секция поверх страницы — как её рисует сборка: data-overlay и hidden на обёртке.
function placeOverlay(
  id: string,
  html = '<h2>Скидка 10%</h2><button data-action="overlay.close">×</button>',
): HTMLElement {
  const element = placeSection('shop:promo', id, html);
  element.setAttribute(OVERLAY_ATTRIBUTE, '');
  element.hidden = true;
  return element;
}

// Запуск ядра с частью overlay; ctx экземпляров — по id.
function run(mode: Mode = 'live'): Map<string, BaseCtx<Record<string, unknown>>> {
  document.head.innerHTML = configTag(mode);
  const ctxs = new Map<string, BaseCtx<Record<string, unknown>>>();
  const section = defineSection({ mount: (_el, ctx) => void ctxs.set(ctx.id, ctx) });
  core = start({ parts: [overlay], sections: [entry('shop:promo', section)] });
  return ctxs;
}

function windowOf(ctxs: Map<string, BaseCtx<Record<string, unknown>>>, id: string): OverlayWindow {
  const found = ctxs.get(id)?.overlay;
  if (found === undefined || found === null) throw new Error(`у ${id} нет ctx.overlay`);
  return found;
}

// expect.stringContaining отдаёт any — типизированный помощник, как в roles.test.ts пакета секций.
const textLike = (fragment: string): unknown => expect.stringContaining(fragment);
const backdrop = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-merfy-overlay-backdrop]');
const key = (name: string): KeyboardEvent =>
  new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });

describe('ctx.overlay', () => {
  it('есть у секции с data-overlay: popover, role="dialog", подпись по заголовку; у остальных — null', () => {
    const promo = placeOverlay('promo-1');
    placeSection('shop:promo', 'inline-1');
    const ctxs = run();
    expect(ctxs.get('inline-1')?.overlay).toBeNull();
    const window = windowOf(ctxs, 'promo-1');
    expect(window.$open.get()).toBe(false);
    expect(promo.getAttribute('popover')).toBe('manual');
    expect(promo.getAttribute('role')).toBe('dialog');
    expect(promo.getAttribute('tabindex')).toBe('-1');
    const heading = promo.querySelector('h2');
    expect(promo.getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(heading?.id).toBe('merfy-overlay-promo-1-title');
    expect(promo.hidden).toBe(true);
  });

  it('open() — по центру с затемнением: hidden снят, aria-modal, подложка, прокрутка заперта; $open — true', () => {
    const promo = placeOverlay('promo-1');
    const ctxs = run();
    const seen: boolean[] = [];
    ctxs.get('promo-1')?.watch(windowOf(ctxs, 'promo-1').$open, (value) => seen.push(value));
    expect(windowOf(ctxs, 'promo-1').open()).toEqual({ ok: true, data: {} });
    expect(promo.hidden).toBe(false);
    expect(promo.getAttribute('data-position')).toBe('center');
    expect(promo.getAttribute('aria-modal')).toBe('true');
    expect(backdrop()?.hidden).toBe(false);
    expect(backdrop()?.hasAttribute('data-dim')).toBe(true);
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.getElementById('merfy-overlay')?.textContent).toContain('[data-position="corner"]');
    expect(seen).toEqual([false, true]);
    expect(windowOf(ctxs, 'promo-1').open({ position: 'sheet' })).toEqual({ ok: true, data: {} });
    expect(promo.getAttribute('data-position')).toBe('center');
  });

  it('шторка без затемнения и угол: у угла нет aria-modal, подложки и запрета прокрутки', () => {
    const sheet = placeOverlay('sheet-1');
    const corner = placeOverlay('corner-1');
    const ctxs = run();
    windowOf(ctxs, 'sheet-1').open({ position: 'sheet', backdrop: false });
    expect(sheet.getAttribute('data-position')).toBe('sheet');
    expect(backdrop()?.hasAttribute('data-dim')).toBe(false);
    windowOf(ctxs, 'sheet-1').close();
    expect(document.documentElement.style.overflow).toBe('');
    windowOf(ctxs, 'corner-1').open({ position: 'corner', side: 'left' });
    expect([corner.getAttribute('data-position'), corner.getAttribute('data-side')]).toEqual(['corner', 'left']);
    expect(corner.hasAttribute('aria-modal')).toBe(false);
    expect(backdrop()?.hidden).toBe(true);
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('очередь: второе модальное окно — refused, угол рядом с модальным — можно, второй угол — refused', () => {
    placeOverlay('a');
    placeOverlay('b');
    placeOverlay('c');
    placeOverlay('d');
    const ctxs = run();
    expect(windowOf(ctxs, 'a').open().ok).toBe(true);
    const second = windowOf(ctxs, 'b').open({ position: 'sheet' });
    expect(second).toEqual({ ok: false, error: { code: 'refused', message: textLike('shop:promo') } });
    expect(windowOf(ctxs, 'c').open({ position: 'corner' }).ok).toBe(true);
    expect(windowOf(ctxs, 'd').open({ position: 'corner' }).ok).toBe(false);
    windowOf(ctxs, 'a').close();
    expect(windowOf(ctxs, 'b').open().ok).toBe(true);
  });

  it('неверные параметры — invalid и строка в консоли, окно закрыто', () => {
    const promo = placeOverlay('promo-1');
    const ctxs = run();
    const window = windowOf(ctxs, 'promo-1');
    const bad: unknown[] = [
      { position: 'top' },
      { side: 'up' },
      { backdrop: 'yes' },
      { position: 'corner', backdrop: true },
      5,
    ];
    // Неверное значение — так его передаст скрипт на JS: тип в TS такого не пустит.
    const codes = bad.map((options): unknown => {
      const result: unknown = Reflect.apply((value?: OverlayOptions) => window.open(value), undefined, [options]);
      return Reflect.get(Object(Reflect.get(Object(result), 'error')), 'code');
    });
    expect(codes).toEqual(Array(5).fill('invalid'));
    expect(failures.consoleError).toHaveBeenCalledWith(expect.stringContaining('ctx.overlay: position'));
    expect(promo.hidden).toBe(true);
  });

  it('close() — событие с reason code, окно снова hidden, фокус — туда, где был; повторный close — ok без события', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const promo = placeOverlay('promo-1');
    const ctxs = run();
    outside.focus();
    windowOf(ctxs, 'promo-1').open();
    // В jsdom нет раскладки — фокус на самом окне; первый элемент окна — в тесте Chromium.
    expect(promo.contains(document.activeElement)).toBe(true);
    windowOf(ctxs, 'promo-1').close();
    windowOf(ctxs, 'promo-1').close();
    expect(closed).toEqual([{ section: 'shop:promo', id: 'promo-1', reason: 'code' }]);
    expect(promo.hidden).toBe(true);
    expect(promo.hasAttribute('data-position')).toBe(false);
    expect(document.activeElement).toBe(outside);
    expect(windowOf(ctxs, 'promo-1').$open.get()).toBe(false);
  });

  it('data-action="overlay.close" — reason button; в секции не поверх страницы — invalid', async () => {
    const promo = placeOverlay('promo-1');
    const inline = placeSection('shop:promo', 'inline-1', '<button data-action="overlay.close">×</button>');
    const ctxs = run();
    windowOf(ctxs, 'promo-1').open();
    promo.querySelector('button')?.click();
    inline.querySelector('button')?.click();
    await tick();
    expect(closed).toEqual([{ section: 'shop:promo', id: 'promo-1', reason: 'button' }]);
    expect(failures.consoleError).toHaveBeenCalledWith(expect.stringContaining('overlay.close — только'));
  });

  it('Esc закрывает модальное окно; угловое — только когда фокус в нём; клик по подложке — reason backdrop', () => {
    placeOverlay('modal-1');
    const corner = placeOverlay('corner-1');
    const ctxs = run();
    windowOf(ctxs, 'corner-1').open({ position: 'corner' });
    windowOf(ctxs, 'modal-1').open();
    document.dispatchEvent(key('Escape'));
    expect(windowOf(ctxs, 'corner-1').$open.get()).toBe(true);
    document.dispatchEvent(key('Escape'));
    expect(windowOf(ctxs, 'corner-1').$open.get()).toBe(true);
    corner.querySelector('button')?.focus();
    document.dispatchEvent(key('Escape'));
    windowOf(ctxs, 'modal-1').open();
    backdrop()?.click();
    expect(closed.map((detail): unknown => Reflect.get(Object(detail), 'reason'))).toEqual([
      'escape',
      'escape',
      'backdrop',
    ]);
  });

  it('браузер без popover — refused, страница как была', () => {
    const promo = placeOverlay('promo-1');
    Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
    const ctxs = run();
    expect(windowOf(ctxs, 'promo-1').open()).toEqual({
      ok: false,
      error: { code: 'refused', message: 'браузер не показывает окна поверх страницы' },
    });
    expect(promo.hidden).toBe(true);
    expect(promo.hasAttribute('popover')).toBe(false);
  });

  it('запрет прокрутки — общий с окнами поведения dialog: закрытое окно не отпирает страницу под открытым', () => {
    placeOverlay('promo-1');
    const ctxs = run();
    windowOf(ctxs, 'promo-1').open();
    lockScroll(document); // окно поведения dialog
    windowOf(ctxs, 'promo-1').close();
    expect(document.documentElement.style.overflow).toBe('hidden');
    unlockScroll(document);
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('секцию убрали с открытым окном — прокрутка отперта, события нет', async () => {
    const promo = placeOverlay('promo-1');
    const ctxs = run();
    windowOf(ctxs, 'promo-1').open();
    promo.remove();
    await tick();
    expect(document.documentElement.style.overflow).toBe('');
    expect(closed).toEqual([]);
    expect(backdrop()?.hidden).toBe(true);
  });
});

describe('ctx.overlay в превью', () => {
  it('выбор секции открывает окно с параметрами её скрипта, фокус остаётся снаружи; снятие выбора — закрывает', () => {
    const outside = document.createElement('input');
    document.body.append(outside);
    const promo = placeOverlay('promo-1');
    const ctxs = run('preview');
    windowOf(ctxs, 'promo-1').open({ position: 'sheet' });
    windowOf(ctxs, 'promo-1').close();
    outside.focus();
    promo.dispatchEvent(new Event(OVERLAY_SHOW_EVENT));
    expect(promo.getAttribute('data-position')).toBe('sheet');
    expect(document.activeElement).toBe(outside);
    promo.dispatchEvent(new Event(OVERLAY_HIDE_EVENT));
    expect(promo.hidden).toBe(true);
  });

  it('выбор другой секции закрывает открытое окно того же вида; без open() — по центру', () => {
    const first = placeOverlay('first');
    const second = placeOverlay('second');
    const ctxs = run('preview');
    windowOf(ctxs, 'first').open();
    second.dispatchEvent(new Event(OVERLAY_SHOW_EVENT));
    expect([first.hidden, second.hidden]).toEqual([true, false]);
    expect(second.getAttribute('data-position')).toBe('center');
  });
});
