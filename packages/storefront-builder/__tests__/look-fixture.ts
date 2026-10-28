// Подмена отрисовщика снимков (перенесено 28.10 из merfy-mcp `tests/server/look-fixture.ts`): страницы без браузера,
// снимки заданного веса, запись вызовов.
import {
  VIEWPORTS,
  type DetectorFinding,
  type LayoutFinding,
  type LookDevice,
  type PageFacts,
  type PageRenderer,
  type PageSession,
  type RenderInput,
} from '../src/look/look-types';

export interface FakeSessionOptions {
  pageHeight?: number;
  // Вес снимка в байтах; функция — вес по номеру экрана и качеству.
  shotBytes?: number | ((index: number, quality: number) => number);
  facts?: Partial<PageFacts>;
  findings?: DetectorFinding[];
  detectError?: Error;
  shootError?: Error;
  // Находки проверок вёрстки, которые вернёт страница; `layoutError` — проверки падают.
  layout?: LayoutFinding[];
  layoutError?: Error;
  // Вес вырезки в байтах.
  clipBytes?: number;
}

export interface ShootCall {
  device: LookDevice;
  index: number;
  quality: number;
}

export function fakeSession(device: LookDevice, options: FakeSessionOptions, calls: ShootCall[]): PageSession {
  const bytes = options.shotBytes ?? 1_000;
  return {
    device,
    viewport: VIEWPORTS[device],
    facts: {
      pageHeight: options.pageHeight ?? VIEWPORTS[device].height,
      brokenImages: 0,
      consoleErrors: [],
      sideScroll: false,
      ...options.facts,
    },
    shoot(index, quality) {
      if (options.shootError) return Promise.reject(options.shootError);
      calls.push({ device, index, quality });
      const size = typeof bytes === 'function' ? bytes(index, quality) : bytes;
      return Promise.resolve(new Uint8Array(size).fill(index + 1));
    },
    detect() {
      if (options.detectError) return Promise.reject(options.detectError);
      return Promise.resolve(options.findings ?? []);
    },
    layout() {
      if (options.layoutError) return Promise.reject(options.layoutError);
      return Promise.resolve(options.layout ?? []);
    },
    shootClip(finding) {
      return Promise.resolve(new Uint8Array(options.clipBytes ?? 500).fill(finding.mark + 1));
    },
  };
}

export interface FakeRendererOptions {
  desktop?: FakeSessionOptions;
  mobile?: FakeSessionOptions;
  openError?: Error;
}

export function fakeRenderer(options: FakeRendererOptions = {}) {
  const calls: ShootCall[] = [];
  const opened: RenderInput[] = [];
  const state = { closed: 0 };
  const renderer: PageRenderer = {
    open(input) {
      opened.push(input);
      if (options.openError) return Promise.reject(options.openError);
      return Promise.resolve({
        sessions: input.devices.map((device) => fakeSession(device, options[device] ?? {}, calls)),
        close() {
          state.closed += 1;
          return Promise.resolve();
        },
      });
    },
  };
  return { renderer, calls, opened, state };
}
