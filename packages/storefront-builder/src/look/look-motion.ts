// Раскадровка анимаций страницы (часть 3в спеки анимаций, 12.11): кадры секций через 0, 200, 400 и 800 мс после входа в
// экран и список анимаций страницы. Нужна, потому что снимок черновика — последний кадр: модель движения не видит.
//
// Режим. Снимок рисует HTML превью (`/api/sites/:id/preview`), а у него в `merfy-config` стоит `mode: "preview"`: ядро
// витрины в этом режиме не играет ни появления (`reveal.attach`), ни `ctx.animate` (оба — сразу последний кадр,
// `behaviors/prefs.ts`). Для кадров страница открывается второй раз в режиме витрины (`mode: "live"`), а появления
// включены принудительно: `data-motion-reveal="on"` у `<html>`, даже если у магазина они выключены (в ответе — `revealForced`).
// Основной снимок остаётся в режиме превью, как был.
//
// Кадры. Часы анимаций не ждём: анимации Web Animations (на них стоят пресеты `data-animate` и `ctx.animate`) в момент
// создания ставятся на паузу в нуле, потом каждому кадру — свой `currentTime`. Так кадры не зависят от скорости съёмки.
// Анимации на JS без Web Animations (`lib:motion`, прокрутка по таймлайну) и CSS-анимации сюда не попадают.
import { z } from 'zod';
import { errorText } from '../errors';
import { BUDGET_BYTES, base64Size } from './look-fit';
import { LookError, type LookDevice, type MotionAnimation, type MotionCapture, type PageSession } from './look-types';

// Через сколько мс после входа секции в экран снимается кадр.
export const MOTION_FRAME_TIMES = [0, 200, 400, 800] as const;
// Секций с кадрами на ответ: 4 кадра на секцию, больше — вес растёт быстрее пользы. Остальные идут только в список.
export const MOTION_MAX_SECTIONS = 3;
// Высота кадра: секция выше обрезается снизу.
export const MOTION_FRAME_MAX_HEIGHT = 560;
// Вес кадров в base64: меньше, чем остаётся от предела ответа, если экраны заняли много.
export const MOTION_MAX_BYTES = 700_000;
// Доля предела ответа, которую экраны страницы не занимают, когда кадры просили: иначе `full` съел бы всё.
export const MOTION_RESERVE_BYTES = 600_000;
// Качество кадров: первый проход и запасной, если даже одна секция не влезла.
export const MOTION_QUALITY = 55;
export const MOTION_QUALITY_LOW = 35;
// Сверх срока отрисовки (30 с), когда просили кадры: вторая загрузка страницы и 12 снимков.
export const MOTION_EXTRA_MS = 15_000;
// Страницы кабинета: гостью в режиме витрины уводит на «Вход» (`core/private-pages.ts`), кадров там нет.
const PRIVATE_PAGE_IDS: ReadonlySet<string> = new Set(['page-profile', 'page-orders']);

export const CONFIG_SCRIPT = /<script[^>]*\bid="merfy-config"[^>]*>([\s\S]*?)<\/script>/;
const HTML_TAG = /<html\b([^>]*)>/i;
const REVEAL_ATTRIBUTE = /\sdata-motion-reveal\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

const ConfigShape = z.looseObject({
  mode: z.enum(['live', 'preview']),
  page: z.looseObject({ id: z.string() }),
});

export type MotionHtml = { ok: true; html: string; revealForced: boolean } | { ok: false; reason: string };

// HTML превью → HTML для кадров: конфиг в режиме витрины (без счётчиков аналитики: превью их и так не несёт) и появления
// включены. Секция в `<script>` не должна закрыть тег, поэтому `<` в JSON экранируется.
export function motionHtmlOf(html: string): MotionHtml {
  const script = CONFIG_SCRIPT.exec(html);
  if (script === null || script[1] === undefined) return { ok: false, reason: 'у страницы нет конфига витрины' };
  let raw: unknown;
  try {
    raw = JSON.parse(script[1]);
  } catch {
    return { ok: false, reason: 'конфиг витрины не разобрался' };
  }
  const shape = ConfigShape.safeParse(raw);
  if (!shape.success) return { ok: false, reason: 'конфиг витрины не по форме' };
  if (PRIVATE_PAGE_IDS.has(shape.data.page.id)) {
    return { ok: false, reason: 'страница кабинета: гостью в режиме витрины уводит на «Вход»' };
  }
  const config = JSON.stringify({ ...shape.data, mode: 'live', analytics: null }).replace(/</g, '\\u003c');
  const withConfig = html.replace(script[0], () => script[0].replace(script[1] ?? '', () => config));

  return revealOn(withConfig);
}

// `data-motion-reveal="on"` у `<html>`: без него появления не запускаются (`behaviors/reveal.ts`). Было ли оно уже `on`.
function revealOn(html: string): MotionHtml {
  const tag = HTML_TAG.exec(html);
  if (tag === null) return { ok: false, reason: 'в странице нет тега html' };
  const attributes = tag[1] ?? '';
  const current = REVEAL_ATTRIBUTE.exec(attributes);
  const was = current?.[1] ?? current?.[2];
  const next =
    current === null
      ? `${attributes} data-motion-reveal="on"`
      : attributes.replace(REVEAL_ATTRIBUTE, ' data-motion-reveal="on"');
  return { ok: true, html: html.replace(tag[0], () => `<html${next}>`), revealForced: was !== 'on' };
}

// Скрипт, который ставится в страницу до всех остальных: каждая новая анимация Web Animations записывается и, если
// конечная, встаёт на паузу в нуле. Бесконечные (бегущая строка, пульс) идут как обычно: кадров по времени у них нет.
// Пауза держится всё время раскадровки: вход секции в экран создаёт её анимации, а время кадра им задаём мы.
export const HOLD_SCRIPT = `(() => {
  const state = { records: [], sections: [], items: [] };
  Object.defineProperty(window, '__lookMotion', { value: state });
  const original = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    const animation = original.call(this, keyframes, options);
    if (state.records.length >= 400) return animation;
    try {
      const loop = !Number.isFinite(animation.effect.getComputedTiming().endTime);
      state.records.push({ animation, node: this, loop });
      if (!loop) {
        animation.pause();
        animation.currentTime = 0;
      }
    } catch {}
    return animation;
  };
  // Секции страницы в порядке документа и записанные анимации с секцией и пресетом. Секция — ближайший
  // merfy-section[data-section-id]; пресет — ближайший data-animate, а у анимации самой секции (appear-side) — внутри неё.
  // Звать после каждой прокрутки: вход в экран создаёт новые анимации.
  state.collect = () => {
    const sections = [...document.querySelectorAll('merfy-section[data-section-id]')];
    state.sections = sections;
    const nodes = [];
    state.items = state.records.map((record) => {
      if (!nodes.includes(record.node)) nodes.push(record.node);
      const section = record.node.closest('merfy-section[data-section-id]');
      const host = record.node.closest('[data-animate]') ?? record.node.querySelector?.('[data-animate]') ?? null;
      const timing = record.animation.effect.getComputedTiming();
      return {
        animation: record.animation,
        node: nodes.indexOf(record.node),
        section,
        loop: record.loop,
        preset: host ? host.getAttribute('data-animate') : null,
        duration: Number(timing.duration) || 0,
        delay: Number(timing.delay) || 0,
        end: Number.isFinite(timing.endTime) ? timing.endTime : 0,
      };
    });
    // Список — в порядке документа (анимации создавались в порядке входа в экран); вне секций — в конце.
    const place = (item) => (item.section ? sections.indexOf(item.section) : sections.length);
    state.items.sort((a, b) => place(a) - place(b));
    return state.items.map((item) => ({
      section: item.section ? item.section.getAttribute('data-section-id') : null,
      type: item.section ? item.section.getAttribute('data-section') : null,
      preset: item.preset,
      duration: item.duration,
      delay: item.delay,
      loop: item.loop,
      node: item.node,
    }));
  };
})()`;

// Мелкая прокрутка страницы до конца: шаг — полэкрана, а не экран, как в основной загрузке, иначе элемент у границы между
// шагами не попадает под наблюдатель появлений. Потом то, что записалось, собирается в строки.
export const COLLECT_SCRIPT = `(async () => {
  const step = Math.max(200, Math.floor(window.innerHeight / 2));
  const end = Math.min(document.documentElement.scrollHeight, step * 80);
  for (let y = 0; y < end; y += step) {
    window.scrollTo(0, y);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  window.scrollTo(0, 0);
  await new Promise((resolve) => setTimeout(resolve, 150));
  return window.__lookMotion.collect();
})()`;

// Записанное без прокрутки (после кадров: список страницы полный).
export const REFRESH_SCRIPT = 'window.__lookMotion.collect()';

const RawRows = z.array(
  z.object({
    section: z.string().nullable(),
    type: z.string().nullable(),
    preset: z.string().nullable(),
    duration: z.number(),
    delay: z.number(),
    loop: z.boolean(),
    // Номер элемента: у элемента по анимации на свойство (прозрачность, сдвиг), считаем элементы, а не анимации.
    node: z.number(),
  }),
);
export type MotionRow = z.infer<typeof RawRows>[number];

export function parseRows(raw: unknown): MotionRow[] {
  return RawRows.parse(raw);
}

// Анимации страницы одной строкой на пару «секция, пресет, длительность»: сколько элементов и с какой задержкой.
export function groupAnimations(rows: readonly MotionRow[]): MotionAnimation[] {
  const groups = new Map<string, { row: MotionRow; delays: number[]; nodes: Set<number> }>();
  for (const row of rows) {
    const key = JSON.stringify([row.section, row.preset, Math.round(row.duration), row.loop]);
    const group = groups.get(key);
    if (group) {
      group.delays.push(row.delay);
      group.nodes.add(row.node);
    } else groups.set(key, { row, delays: [row.delay], nodes: new Set([row.node]) });
  }
  return [...groups.values()].map(({ row, delays, nodes }) => ({
    section: row.section,
    type: row.type,
    preset: row.preset,
    durationMs: Math.round(row.duration),
    delayMs: Math.round(Math.min(...delays)),
    spanMs: Math.round(Math.max(...delays) - Math.min(...delays)),
    elements: nodes.size,
    loop: row.loop,
  }));
}

// Секции, которым пробуем снять кадры, в порядке документа: те, где уже записана конечная анимация, и те, где есть
// `data-animate` (анимация создастся, когда секция войдёт в экран при кадрах).
export const MOTION_SECTIONS_SCRIPT = `(() => {
  const state = window.__lookMotion;
  const animated = new Set(state.items.filter((item) => item.section && !item.loop).map((item) => item.section));
  return state.sections
    .filter((section) => animated.has(section) || section.querySelector('[data-animate]'))
    .map((section) => section.getAttribute('data-section-id'));
})()`;

// Подготовка кадров секции: прокрутка к её верху, ожидание, пока вход в экран создаст её анимации (они встают на паузу в
// нуле), липкие и плавающие чужие элементы на время кадров скрыты (иначе шапка закроет верх). Ответ — место секции в
// экране; `null`, если секции не видно или анимаций у неё нет (одинаковые кадры только съели бы вес).
export const motionBeginScript = (section: string): string => `(async (id) => {
  const state = window.__lookMotion;
  const target = state.sections.find((node) => node.getAttribute('data-section-id') === id);
  if (!target) return null;
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + window.scrollY), left: 0, behavior: 'instant' });
  await new Promise((resolve) => setTimeout(resolve, 200));
  state.collect();
  if (!state.items.some((item) => item.section === target && !item.loop)) return null;
  const style = document.createElement('style');
  style.id = '__look-motion-hide';
  style.textContent = '[data-look-hide]{visibility:hidden !important}';
  document.head.append(style);
  for (const node of document.body.querySelectorAll('*')) {
    if (target.contains(node) || node.contains(target)) continue;
    const position = getComputedStyle(node).position;
    if (position === 'fixed' || position === 'sticky') node.setAttribute('data-look-hide', '');
  }
  const rect = target.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1 || !target.checkVisibility()) return null;
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height, type: target.getAttribute('data-section') };
})(${JSON.stringify(section)})`;

// Время кадра: секция и всё, что в этот момент в экране, — на `at` мс; секции выше по документу уже доиграны, ниже — ещё не
// начали (в экране они появились бы позже). После установки времени ждём два кадра отрисовки.
export const motionSetScript = (section: string, at: number): string => `((id, at) => {
  const state = window.__lookMotion;
  const target = state.sections.find((node) => node.getAttribute('data-section-id') === id);
  const inScreen = (node) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  };
  for (const item of state.items) {
    if (item.loop) continue;
    let time = 0;
    if (item.section === target || (item.section && inScreen(item.section))) time = Math.min(at, item.end);
    else if (item.section && target && (item.section.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)) time = item.end;
    item.animation.currentTime = time;
  }
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))));
})(${JSON.stringify(section)}, ${at})`;

export const MOTION_END_SCRIPT = `(() => {
  document.getElementById('__look-motion-hide')?.remove();
  for (const node of document.querySelectorAll('[data-look-hide]')) node.removeAttribute('data-look-hide');
})()`;

type OkCapture = Extract<MotionCapture, { ok: true }>;

const weightOf = (capture: OkCapture): number =>
  capture.shots.reduce(
    (sum, shot) => sum + shot.frames.reduce((inner, frame) => inner + base64Size(frame.length), 0),
    0,
  );

// Сколько веса есть кадрам: не больше `MOTION_MAX_BYTES` и не больше, чем осталось от предела ответа.
export const motionBudget = (usedBytes: number): number =>
  Math.max(0, Math.min(MOTION_MAX_BYTES, BUDGET_BYTES - usedBytes));

export interface MotionFrame {
  at: number;
  image: string;
}

export type LookMotion =
  | {
      ok: true;
      device: LookDevice;
      // Появления у магазина выключены, а на снимке включены.
      revealForced: boolean;
      animations: MotionAnimation[];
      sections: Array<{ section: string; type: string | null; frames: MotionFrame[] }>;
      // Секций с анимациями больше, чем кадров: остальные только в списке.
      skipped: number;
    }
  | { ok: false; reason: string };

// Устройство кадров: телефон, если просили только его, иначе компьютер.
export const motionDevice = (devices: 'mobile' | 'desktop' | 'both'): LookDevice =>
  devices === 'mobile' ? 'mobile' : 'desktop';

// Снимает кадры и укладывает их в вес: сначала нормальное качество; не влезло — последние секции убираются; одна секция
// не влезла — она переснимается на худшем качестве.
async function fitCapture(session: PageSession, first: OkCapture, budget: number): Promise<OkCapture> {
  let capture = first;
  while (weightOf(capture) > budget && capture.shots.length > 1) {
    capture = { ...capture, shots: capture.shots.slice(0, -1), skipped: capture.skipped + 1 };
  }
  if (weightOf(capture) > budget && capture.shots.length === 1) {
    const lower = await session.motion({ sections: 1, quality: MOTION_QUALITY_LOW });
    if (lower.ok) capture = { ...lower, skipped: capture.skipped };
  }
  // Не влезла и одна секция на худшем качестве: кадров нет, но список анимаций остаётся.
  return weightOf(capture) > budget
    ? { ...capture, shots: [], skipped: capture.skipped + capture.shots.length }
    : capture;
}

export async function captureMotion(session: PageSession, budget: number): Promise<LookMotion> {
  try {
    const first = await session.motion({ sections: MOTION_MAX_SECTIONS, quality: MOTION_QUALITY });
    if (!first.ok) return first;
    const capture = await fitCapture(session, first, budget);
    return {
      ok: true,
      device: session.device,
      revealForced: capture.revealForced,
      animations: capture.animations,
      sections: capture.shots.map((shot) => ({
        section: shot.section,
        type: shot.type,
        frames: shot.frames.map((frame, index) => ({
          at: MOTION_FRAME_TIMES[index] ?? 0,
          image: Buffer.from(frame).toString('base64'),
        })),
      })),
      skipped: capture.skipped,
    };
  } catch (error) {
    if (error instanceof LookError) throw error;
    return { ok: false, reason: (errorText(error).split('\n')[0] ?? '').slice(0, 200) };
  }
}
