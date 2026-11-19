// Подмена отрисовщика снимков (перенесено 28.10 из merfy-mcp `tests/server/look-fixture.ts`): страницы без браузера,
// снимки заданного веса, запись вызовов.
import {
  VIEWPORTS,
  type DetectorFinding,
  type LayoutFinding,
  type LookDevice,
  type MarkResult,
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
  // Нарушения axe, как их отдаёт страница (`checks/browser/semantic.ts`); `semanticError` — падает, `semanticHangs` —
  // не отвечает. Настоящий axe в Chromium проверяет `look-browser.test.ts`.
  semantic?: unknown[];
  semanticError?: Error;
  semanticHangs?: boolean;
  // Что вернёт замер Web Vitals (`checks/browser/vitals.ts`, по умолчанию — чистая загрузка) и Lighthouse по вкладке
  // (`checks/browser/lighthouse.ts`, по умолчанию — без находок); `…Error` — падает, `lighthouseHangs` — не отвечает.
  // Настоящие замер и Lighthouse в Chromium проверяет `look-browser.test.ts`.
  vitals?: unknown;
  vitalsError?: Error;
  lighthouse?: unknown;
  lighthouseError?: Error;
  lighthouseHangs?: boolean;
  // Что вернёт проверка меток; `marksHang` — она не отвечает.
  marks?: MarkResult[];
  marksHang?: boolean;
  // Раскадровка: кадры по секциям (вес кадра — `frameBytes` функцией от качества), список анимаций; `motionError` — падает.
  motion?: {
    sections?: string[];
    frameBytes?: number | ((quality: number) => number);
    revealForced?: boolean;
    refusal?: string;
    error?: Error;
  };
}

// Вызовы раскадровки: сколько секций и с каким качеством просили.
export interface MotionCalls {
  device: LookDevice;
  sections: number;
  quality: number;
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
  // На каких устройствах читали Web Vitals и запускали Lighthouse.
  vitals?: LookDevice[];
  lighthouse?: LookDevice[];
}

const PLACE: SectionPlace = { x: 0, y: 0, width: 390, height: 600, fullHeight: 600, pinned: false };

// Загрузка без прыжков, длинных задач и проблем с главным элементом.
export const CLEAN_VITALS = {
  shifts: [],
  lcp: null,
  long: [],
  mounts: [],
  fcp: 120,
  loadedAt: 1_500,
  readAt: 3_000,
  cpuRate: 4,
};

export function fakeSession(
  device: LookDevice,
  options: FakeSessionOptions,
  calls: ShootCall[],
  sectionCalls: SectionCalls = { located: [], shot: [], layout: [], detect: [] },
  motionCalls: MotionCalls[] = [],
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
    semantic() {
      if (options.semanticError) return Promise.reject(options.semanticError);
      if (options.semanticHangs) return new Promise<unknown>(() => undefined);
      return Promise.resolve(options.semantic ?? []);
    },
    vitals() {
      sectionCalls.vitals?.push(device);
      if (options.vitalsError) return Promise.reject(options.vitalsError);
      return Promise.resolve(options.vitals ?? CLEAN_VITALS);
    },
    lighthouse() {
      sectionCalls.lighthouse?.push(device);
      if (options.lighthouseError) return Promise.reject(options.lighthouseError);
      if (options.lighthouseHangs) return new Promise<unknown>(() => undefined);
      return Promise.resolve(options.lighthouse ?? []);
    },
    marks() {
      if (options.marksHang) return new Promise<MarkResult[]>(() => undefined);
      return Promise.resolve(options.marks ?? []);
    },
    motion({ sections, quality }) {
      motionCalls.push({ device, sections, quality });
      const motion = options.motion ?? {};
      if (motion.error) return Promise.reject(motion.error);
      if (motion.refusal) return Promise.resolve({ ok: false, reason: motion.refusal });
      const ids = (motion.sections ?? ['hero-1', 'gallery-2']).slice(0, sections);
      const size = typeof motion.frameBytes === 'function' ? motion.frameBytes(quality) : (motion.frameBytes ?? 1_000);
      return Promise.resolve({
        ok: true,
        revealForced: motion.revealForced ?? false,
        animations: [
          {
            section: 'hero-1',
            type: 'hero',
            preset: 'fade-up',
            durationMs: 600,
            delayMs: 0,
            spanMs: 0,
            elements: 1,
            loop: false,
          },
        ],
        shots: ids.map((section, at) => ({
          section,
          type: null,
          frames: [0, 1, 2, 3].map((frame) => new Uint8Array(size).fill(at * 10 + frame + 1)),
        })),
        skipped: Math.max(0, (motion.sections ?? ['hero-1', 'gallery-2']).length - ids.length),
      });
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
  const sectionCalls: SectionCalls = { located: [], shot: [], layout: [], detect: [], vitals: [], lighthouse: [] };
  const opened: RenderInput[] = [];
  const motionCalls: MotionCalls[] = [];
  const state = { closed: 0 };
  const renderer: PageRenderer = {
    open(input) {
      opened.push(input);
      if (options.openError) return Promise.reject(options.openError);
      return Promise.resolve({
        sessions: input.devices.map((device) =>
          fakeSession(device, options[device] ?? {}, calls, sectionCalls, motionCalls),
        ),
        close() {
          state.closed += 1;
          return Promise.resolve();
        },
      });
    },
  };
  return { renderer, calls, sectionCalls, motionCalls, opened, state };
}
