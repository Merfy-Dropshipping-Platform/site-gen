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
  type SectionPlace,
} from '../src/look/look-types';

export interface FakeSessionOptions {
  pageHeight?: number;
  // Вес снимка в байтах; функция — вес по номеру экрана и качеству.
  shotBytes?: number | ((index: number, quality: number) => number);
  facts?: Partial<PageFacts>;
  findings?: DetectorFinding[];
  detectError?: Error;
  // Находки детектора по id секции (запуск с `section`): отбор по элементам внутри секции делает страница, в проверке
  // с подменой — этот список. Настоящий отбор проверяет `look-browser.test.ts` в Chromium.
  sectionFindings?: Record<string, DetectorFinding[]>;
  // Детектор не отвечает.
  detectHangs?: boolean;
  shootError?: Error;
  // Находки проверок вёрстки, которые вернёт страница; `layoutError` — проверки падают.
  layout?: LayoutFinding[];
  layoutError?: Error;
  // Вес вырезки в байтах.
  clipBytes?: number;
  // Снимок секции: где она на этом устройстве (`null` — не видно; не задано — стоит в начале страницы) и вес её картинки
  // функцией от качества.
  section?: { place?: SectionPlace | null; bytes?: number | ((quality: number) => number) };
}

export interface ShootCall {
  device: LookDevice;
  index: number;
  quality: number;
}

// Вызовы по секции: поиск места, съёмка с качеством, проверки вёрстки с id секции.
export interface SectionCalls {
  located: Array<{ device: LookDevice; section: string }>;
  shot: Array<{ device: LookDevice; section: string; quality: number }>;
  layout: Array<{ device: LookDevice; section: string | undefined }>;
  // Запуски детектора: с id секции — в снимке секции, без него — в снимке страницы.
  detect: Array<{ device: LookDevice; section: string | undefined }>;
}

const PLACE: SectionPlace = { x: 0, y: 0, width: 390, height: 600, fullHeight: 600, pinned: false };

export function fakeSession(
  device: LookDevice,
  options: FakeSessionOptions,
  calls: ShootCall[],
  sectionCalls: SectionCalls = { located: [], shot: [], layout: [], detect: [] },
): PageSession {
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
    detect(section) {
      sectionCalls.detect.push({ device, section });
      if (options.detectError) return Promise.reject(options.detectError);
      // Детектор завис: ответа нет, пока страницу не закроют.
      if (options.detectHangs) return new Promise<DetectorFinding[]>(() => undefined);
      // Находки по секциям, как отбирает их страница: с `section` — только своя секция.
      const own = section === undefined ? options.findings : (options.sectionFindings?.[section] ?? []);
      return Promise.resolve(own ?? []);
    },
    layout(section) {
      sectionCalls.layout.push({ device, section });
      if (options.layoutError) return Promise.reject(options.layoutError);
      return Promise.resolve(options.layout ?? []);
    },
    shootClip(finding) {
      return Promise.resolve(new Uint8Array(options.clipBytes ?? 500).fill(finding.mark + 1));
    },
    locateSection(section) {
      sectionCalls.located.push({ device, section });
      const place = options.section?.place;
      return Promise.resolve(place === undefined ? PLACE : place);
    },
    shootSection(_place, section, quality) {
      sectionCalls.shot.push({ device, section, quality });
      const bytes = options.section?.bytes ?? 700;
      return Promise.resolve(new Uint8Array(typeof bytes === 'function' ? bytes(quality) : bytes).fill(9));
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
  const sectionCalls: SectionCalls = { located: [], shot: [], layout: [], detect: [] };
  const opened: RenderInput[] = [];
  const state = { closed: 0 };
  const renderer: PageRenderer = {
    open(input) {
      opened.push(input);
      if (options.openError) return Promise.reject(options.openError);
      return Promise.resolve({
        sessions: input.devices.map((device) => fakeSession(device, options[device] ?? {}, calls, sectionCalls)),
        close() {
          state.closed += 1;
          return Promise.resolve();
        },
      });
    },
  };
  return { renderer, calls, sectionCalls, opened, state };
}
