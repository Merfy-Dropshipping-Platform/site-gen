// Web Vitals страницы в снимке черновика (место `browser`, проверка `vitals`; владелец 18.11: «там же есть метрики
// вебвиталс»). Меряется то, что по черновику честно: замер 18.11 на одном магазине — черновик против опубликованной
// страницы, Lighthouse, телефон, по 3 прогона:
// - CLS (прыжки вёрстки) совпал: подложенный прыжок дал 0,225 и там и там, виновник тот же;
// - главный элемент первого экрана (элемент LCP) тот же;
// - TBT (сколько скрипты держат страницу) похож: 14 против 11 мс.
// Время LCP, FCP и Speed Index по черновику врёт (4,3 с против 1,8 с): превью зашивает стили, скрипты и шрифты в страницу —
// 715 КБ без сжатия против 21 КБ на витрине. Время меряет прогон опубликованной страницы, а не снимок.
//
// Определения — как у Web Vitals и Lighthouse; меряется только загрузка, как в Lighthouse. Конец загрузки — метка снимка
// (`VITALS_LOADED`): сеть затихла, дальше снимок сам прокручивает и снимает страницу, запускает в ней axe и детектор — их
// работа в замер не идёт. Lighthouse ждёт ещё и тишины ЦП: задачу страницы позже метки (сторонний скрипт через 3 с)
// снимок не видит. CLS — наибольшее окно сдвигов загрузки без ввода пользователя (сдвиги не дальше 1 с друг от
// друга, окно не длиннее 5 с; `loadShifts`). TBT — сумма «задача − 50 мс» по длинным задачам между первой отрисовкой и
// концом загрузки; ЦП телефона на время загрузки замедлен, как в Lighthouse (`cpuRateFor`). Пороги — «хорошо» у Google.
//
// К секции находка привязывается так. Прыжок — секция, которая в том же кадре изменила высоту и стоит выше сдвинутого или
// содержит его: двигает то, что выросло сверху, а не то, что сдвинулось (иначе правка одной секции давала бы находку
// соседу снизу). Нет такой — секция самого крупного сдвинутого элемента. TBT — по запуску секций: ядро запускает их подряд
// одной задачей и после каждой шлёт на document событие `merfy:section:mount`; промежуток между событиями — время запуска
// следующей секции (первой — нет: в её промежуток входит запуск самого ядра).
import { z } from 'zod';
import type { LookDevice } from '../../look/look-types';
import { grouped, type CheckFinding, type CheckFix, type FindingDraft } from '../finding';

// Пороги «хорошо» у Google: CLS — Web Vitals; TBT — оценка Lighthouse (телефон 200 мс, компьютер 150 мс).
export const VITALS_LIMITS: Record<LookDevice, { cls: number; tbt: number }> = {
  mobile: { cls: 0.1, tbt: 200 },
  desktop: { cls: 0.1, tbt: 150 },
};

// Длинная задача — дольше 50 мс (Long Tasks API); всё сверх — блокировка.
const LONG_TASK_MS = 50;
// Доля прыжка, меньше которой секцию не называем.
const MIN_SHARE = 0.01;

// Замедление ЦП телефона по скорости машины — по таблице Lighthouse (docs/throttling.md, «Calibrating multipliers»):
// быстрая настольная машина (индекс 1500 и выше) — ×4, средняя (1000–1500) — ×2, слабее — без замедления. Индекс — та же
// мерка, что у Lighthouse (`computeBenchmarkIndex`).
export const DEFAULT_CPU_RATE = 4;
export function cpuRateFor(benchmarkIndex: number): number {
  if (benchmarkIndex >= 1500) return 4;
  if (benchmarkIndex >= 1000) return 2;
  return 1;
}

// Скрипт до скриптов страницы (`addInitScript`): наблюдатели сдвигов, элемента LCP, длинных задач, первой отрисовки и
// событий запуска секций; после метки конца загрузки новое не записывается. Состояние документа до скриптов (что было
// скрыто, у каких картинок не было адреса, какие элементы уже были) снимается, когда разбор HTML закончен
// (`readyState` — interactive), а отложенные и модульные скрипты ещё не начались.
export const VITALS_INIT = `(() => {
  if (window.__lookVitals) return;
  const LIMIT = 200;
  const v = { shifts: [], lcp: null, long: [], mounts: [], fcp: null, loadedAt: null };
  Object.defineProperty(window, '__lookVitals', { value: v });
  const push = (list, item) => { if (list.length < LIMIT) list.push(item); };
  const now = () => performance.now();
  // Записи наблюдателей приходят с опозданием: судить по времени записи, а не по тому, когда она пришла.
  const late = (at) => v.loadedAt !== null && at >= v.loadedAt;
  const elementOf = (node) => (node ? (node.nodeType === 1 ? node : node.parentElement) : null);
  const sectionOf = (el) => {
    const wrapper = el && el.closest ? el.closest('[data-section-id]') : null;
    return wrapper ? wrapper.getAttribute('data-section-id') : null;
  };
  const describe = (el) => {
    if (!el) return 'элемент';
    const tag = el.tagName.toLowerCase();
    if (tag === 'img') {
      const src = (el.currentSrc || el.getAttribute('src') || '').split('?')[0].split('#')[0];
      const file = src.startsWith('data:') ? '' : src.split('/').pop();
      return file ? 'img ' + file : 'img';
    }
    const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    return text ? tag + ' «' + (text.length > 40 ? text.slice(0, 40) + '…' : text) + '»' : tag;
  };
  const start = { taken: false, all: new WeakSet(), hidden: new WeakSet(), noSrc: new WeakSet() };
  const heights = new WeakMap();
  const inserted = new WeakSet();
  const resizes = [];
  const ro = new ResizeObserver((entries) => {
    const t = now();
    for (const entry of entries) {
      const el = entry.target;
      const height = entry.contentRect.height;
      const was = heights.get(el);
      heights.set(el, height);
      if (was === undefined) {
        if (inserted.has(el) && height >= 1) resizes.push({ t, el, delta: height });
      } else if (Math.abs(height - was) >= 1) resizes.push({ t, el, delta: height - was });
    }
    if (resizes.length > 500) resizes.splice(0, resizes.length - 500);
  });
  const takeStart = () => {
    if (start.taken) return;
    start.taken = true;
    for (const el of document.querySelectorAll('*')) {
      start.all.add(el);
      // Скрыт — если и стили его не показывают: атрибут hidden с display из CSS (баннер cookie, 19.11) виден с первого кадра.
      if (el.hasAttribute('hidden') && getComputedStyle(el).display === 'none') start.hidden.add(el);
      if (el.tagName === 'IMG' && !el.hasAttribute('src') && !el.hasAttribute('srcset')) start.noSrc.add(el);
    }
    for (const el of document.querySelectorAll('[data-section-id]')) ro.observe(el);
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          const found = node.hasAttribute('data-section-id') ? [node] : [];
          for (const el of [...found, ...node.querySelectorAll('[data-section-id]')]) {
            inserted.add(el);
            ro.observe(el);
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  };
  if (document.readyState !== 'loading') takeStart();
  else document.addEventListener('readystatechange', () => { if (document.readyState !== 'loading') takeStart(); });
  const watch = (type, fn) => {
    try {
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) fn(entry); }).observe({ type, buffered: true });
    } catch (error) {}
  };
  const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  watch('layout-shift', (entry) => {
    if (late(entry.startTime)) return;
    const sources = (entry.sources || [])
      .map((source) => ({
        el: elementOf(source.node),
        area: source.previousRect.width * source.previousRect.height + source.currentRect.width * source.currentRect.height,
      }))
      .filter((source) => source.el && source.el.isConnected);
    let top = null;
    for (const source of sources) if (top === null || before(source.el, top.el)) top = source;
    let biggest = null;
    for (const source of sources) if (biggest === null || source.area > biggest.area) biggest = source;
    const near = resizes.filter((resize) => resize.t >= entry.startTime - 5 && resize.t <= entry.startTime + 100 && resize.el.isConnected);
    let culprit = null;
    if (top !== null) {
      for (const resize of near) {
        const above = resize.el === top.el || resize.el.contains(top.el) || before(resize.el, top.el);
        if (above && (culprit === null || before(resize.el, culprit.el))) culprit = resize;
      }
    }
    const grew = culprit === null ? 0 : Math.round(culprit.delta);
    push(v.shifts, {
      value: entry.value,
      t: entry.startTime,
      input: entry.hadRecentInput,
      section: culprit !== null ? culprit.el.getAttribute('data-section-id') : biggest !== null ? sectionOf(biggest.el) : null,
      where: culprit !== null
        ? (grew >= 0 ? 'секция выросла на ' + grew + ' px' : 'секция стала ниже на ' + -grew + ' px')
        : biggest !== null ? describe(biggest.el) : 'страница',
    });
  });
  watch('largest-contentful-paint', (entry) => {
    if (late(entry.startTime)) return;
    const el = entry.element || null;
    const tag = el ? el.tagName : '';
    let hidden = false;
    for (let at = el; at; at = at.parentElement) if (start.hidden.has(at)) { hidden = true; break; }
    const image = tag === 'IMG' || tag === 'image';
    v.lcp = {
      t: entry.startTime,
      section: sectionOf(el),
      where: describe(el),
      kind: image ? 'image' : tag === 'VIDEO' ? 'video' : entry.url ? 'background' : 'text',
      lazy: tag === 'IMG' && el.getAttribute('loading') === 'lazy',
      srcByScript: tag === 'IMG' && start.noSrc.has(el),
      shownByScript: hidden,
      insertedByScript: el !== null && start.taken && !start.all.has(el),
    };
  });
  watch('longtask', (entry) => { if (!late(entry.startTime)) push(v.long, { t: entry.startTime, d: entry.duration }); });
  watch('paint', (entry) => { if (entry.name === 'first-contentful-paint') v.fcp = entry.startTime; });
  const mounted = new WeakSet();
  document.addEventListener('merfy:section:mount', () => {
    const t = now();
    if (late(t)) return;
    const ids = [];
    for (const el of document.querySelectorAll('[data-section-id][data-merfy-state="mounted"]')) {
      if (mounted.has(el)) continue;
      mounted.add(el);
      ids.push(el.getAttribute('data-section-id'));
    }
    push(v.mounts, { t, ids });
  });
})();`;

// Скрипт страницы: метка конца загрузки. Снимок ставит её, когда сеть затихла, — перед своей прокруткой.
export const VITALS_LOADED = `(() => {
  const v = window.__lookVitals;
  if (v && v.loadedAt === null) v.loadedAt = performance.now();
})()`;

// Скрипт страницы: что собрали наблюдатели, на момент вызова.
export const VITALS_READ = `(() => {
  const v = window.__lookVitals;
  if (!v) throw new Error('замер Web Vitals не подключился');
  return { shifts: v.shifts, lcp: v.lcp, long: v.long, mounts: v.mounts, fcp: v.fcp, loadedAt: v.loadedAt, readAt: performance.now() };
})()`;

// `input` — флаг hadRecentInput у записи сдвига (см. `loadShifts`).
const Shift = z.object({
  value: z.number(),
  t: z.number(),
  input: z.boolean(),
  section: z.string().nullable(),
  where: z.string(),
});
const Lcp = z.object({
  t: z.number(),
  section: z.string().nullable(),
  where: z.string(),
  kind: z.enum(['image', 'video', 'background', 'text']),
  lazy: z.boolean(),
  srcByScript: z.boolean(),
  shownByScript: z.boolean(),
  insertedByScript: z.boolean(),
});
export const VitalsRaw = z.object({
  shifts: z.array(Shift),
  lcp: Lcp.nullable(),
  long: z.array(z.object({ t: z.number(), d: z.number() })),
  mounts: z.array(z.object({ t: z.number(), ids: z.array(z.string()) })),
  fcp: z.number().nullable(),
  // Метка конца загрузки (`VITALS_LOADED`); нет — окно до чтения.
  loadedAt: z.number().nullable(),
  readAt: z.number(),
  // Во сколько раз был замедлен ЦП на время загрузки (1 — без замедления); ставит снимок, а не страница.
  cpuRate: z.number().positive(),
});
export type VitalsRaw = z.infer<typeof VitalsRaw>;
type Raw = VitalsRaw;
type ShiftRaw = Raw['shifts'][number];
type LcpRaw = NonNullable<Raw['lcp']>;

// `fix` — только если у находки исключение из таблиц места и кода проверки (`FIX_BY_PLACE`, `FIX_BY_CHECK`); сейчас таких
// нет: `lcp-hidden` — `ask` по таблице кодов.
const finding = (rule: string, section: string | null, where: string, text: string, fix?: CheckFix): FindingDraft => ({
  place: 'browser',
  check: 'vitals',
  rule,
  level: 'warning',
  section,
  where,
  text,
  ...(fix === undefined ? {} : { fix }),
});

// 0,23 — как в отчёте PageSpeed по-русски.
const decimal = (value: number): string => value.toFixed(2).replace('.', ',');

// Сдвиги загрузки, которые считает CLS Lighthouse (computed/metrics/cumulative-layout-shift.js). Флаг hadRecentInput
// Chromium ставит и без ввода — эмуляция экрана телефона после перехода считается вводом (crbug 1094974, 1302667;
// проверено 18.11: в снимке телефона так помечены все сдвиги первых 0,5 с). Lighthouse такие сдвиги считает, пока не
// пришёл первый сдвиг без флага; после него флаг значит настоящий ввод. Снимок за загрузку ничего не нажимает — значит,
// помеченный сдвиг до первого без флага — от эмуляции.
export function loadShifts(raw: Pick<Raw, 'shifts' | 'loadedAt'>): Raw['shifts'] {
  const loaded = raw.shifts
    .filter((shift) => raw.loadedAt === null || shift.t < raw.loadedAt)
    .sort((a, b) => a.t - b.t);
  const out: Raw['shifts'] = [];
  let respectInput = false;
  for (const shift of loaded) {
    if (!shift.input) respectInput = true;
    else if (respectInput) continue;
    out.push(shift);
  }
  return out;
}

interface ShiftWindow {
  value: number;
  shifts: ShiftRaw[];
}

// Наибольшее окно сдвигов (определение CLS в Web Vitals): сдвиги окна и его сумма.
export function worstWindow(shifts: readonly ShiftRaw[]): ShiftWindow {
  let worst: ShiftWindow = { value: 0, shifts: [] };
  let current: ShiftWindow & { start: number; last: number } = { value: 0, shifts: [], start: 0, last: -Infinity };
  for (const shift of [...shifts].sort((a, b) => a.t - b.t)) {
    if (shift.t - current.last > 1_000 || shift.t - current.start > 5_000) {
      current = { value: 0, shifts: [], start: shift.t, last: shift.t };
    }
    current.value += shift.value;
    current.shifts.push(shift);
    current.last = shift.t;
    if (current.value > worst.value) worst = { value: current.value, shifts: [...current.shifts] };
  }
  return worst;
}

// Доля каждой секции в окне и самый крупный её сдвиг — он и даёт `where`.
function sharesBySection(shifts: readonly ShiftRaw[]): Map<string | null, { share: number; top: ShiftRaw }> {
  const bySection = new Map<string | null, { share: number; top: ShiftRaw }>();
  for (const shift of shifts) {
    const known = bySection.get(shift.section);
    const top = known === undefined || shift.value > known.top.value ? shift : known.top;
    bySection.set(shift.section, { share: (known?.share ?? 0) + shift.value, top });
  }
  return bySection;
}

function clsFindings(raw: Raw, device: LookDevice): FindingDraft[] {
  const worst = worstWindow(loadShifts(raw));
  const limit = VITALS_LIMITS[device].cls;
  if (worst.value <= limit) return [];
  const bySection = sharesBySection(worst.shifts);
  const page = `Вёрстка прыгает при загрузке: CLS ${decimal(worst.value)} при норме до ${decimal(limit)}`;
  const fix = 'задай место заранее: width и height у картинок, высоту у блоков, которые появляются после загрузки';
  return [...bySection.entries()]
    .filter(([, entry]) => entry.share >= MIN_SHARE)
    .map(([section, entry]) =>
      finding(
        'cls',
        section,
        entry.top.where,
        section === null ? `${page} · ${fix}` : `${page}, из-за этой секции ${decimal(entry.share)} · ${fix}`,
      ),
    );
}

// Что мешает главному элементу первого экрана появиться сразу — по важности: находка одна, первая подошедшая причина.
// Время LCP по черновику не меряется — только устройство.
const LCP_CAUSES: Array<{ rule: string; applies: (lcp: LcpRaw) => boolean; text: string }> = [
  {
    rule: 'lcp-inserted',
    applies: (lcp) => lcp.insertedByScript,
    text: 'Главный элемент первого экрана вставляет скрипт — первый экран ждёт загрузки скриптов · выведи его в шаблоне',
  },
  {
    rule: 'lcp-hidden',
    applies: (lcp) => lcp.shownByScript,
    text:
      'Главный элемент первого экрана скрыт в HTML и его показывает скрипт — первый экран ждёт загрузки скриптов · ' +
      'покажи его в HTML сразу, а если без скрипта нельзя (плашка, окно) — сделай главный блок первого экрана крупнее',
  },
  {
    rule: 'lcp-src-script',
    applies: (lcp) => lcp.srcByScript,
    text:
      'Адрес главной картинки первого экрана ставит скрипт — она начнёт грузиться только после скриптов · ' +
      'выведи src в шаблоне',
  },
  {
    rule: 'lcp-background',
    applies: (lcp) => lcp.kind === 'background',
    text: 'Главная картинка первого экрана — фон в CSS: браузер найдёт её только после стилей · выведи её тегом <img>',
  },
  {
    rule: 'lcp-lazy',
    applies: (lcp) => lcp.lazy,
    text:
      'Главная картинка экрана грузится лениво · поставь в шаблоне секции loading="eager" этой картинке ' +
      '(первым карточкам ряда)',
  },
];

function lcpFindings(raw: Raw): FindingDraft[] {
  const lcp = raw.lcp;
  if (lcp === null) return [];
  const cause = LCP_CAUSES.find((entry) => entry.applies(lcp));
  return cause === undefined ? [] : [finding(cause.rule, lcp.section, lcp.where, cause.text)];
}

// Сколько запускалась каждая секция: промежуток от прошлого события запуска, если оба события — внутри одной длинной
// задачи (ядро запускает секции подряд) и запустилась ровно одна секция. Первое событие пропускается.
export function mountTimes(raw: Pick<Raw, 'mounts' | 'long'>): Array<{ section: string; ms: number }> {
  const inOneTask = (from: number, to: number): boolean =>
    raw.long.some((task) => task.t <= from && to <= task.t + task.d + 1);
  const out: Array<{ section: string; ms: number }> = [];
  for (let index = 1; index < raw.mounts.length; index += 1) {
    const previous = raw.mounts[index - 1];
    const current = raw.mounts[index];
    const section = current?.ids.length === 1 ? current.ids[0] : undefined;
    if (previous === undefined || current === undefined || section === undefined) continue;
    if (inOneTask(previous.t, current.t)) out.push({ section, ms: Math.round(current.t - previous.t) });
  }
  return out;
}

// TBT как у Lighthouse (TBTUtils.calculateTbtImpactForEvent): задача обрезается окном «первая отрисовка — конец
// загрузки», блокировка — то, что в окне сверх 50 мс.
export function totalBlocking(raw: Pick<Raw, 'long' | 'fcp' | 'loadedAt' | 'readAt'>): number {
  const from = raw.fcp ?? 0;
  const to = raw.loadedAt ?? raw.readAt;
  let blocked = 0;
  for (const task of raw.long) {
    const inWindow = Math.min(task.t + task.d, to) - Math.max(task.t, from);
    if (inWindow >= LONG_TASK_MS) blocked += inWindow - LONG_TASK_MS;
  }
  return Math.round(blocked);
}

function tbtFindings(raw: Raw, device: LookDevice): FindingDraft[] {
  const tbt = totalBlocking(raw);
  const limit = VITALS_LIMITS[device].tbt;
  if (tbt <= limit) return [];
  const slowed = raw.cpuRate > 1 ? ` (ЦП замедлен ×${raw.cpuRate}, как у телефона в Lighthouse)` : '';
  const page = `TBT ${tbt} мс при норме до ${limit}${slowed}`;
  const heavy = mountTimes(raw).filter((entry) => entry.ms >= LONG_TASK_MS);
  if (heavy.length === 0)
    return [
      finding(
        'tbt',
        null,
        'страница',
        `Скрипты держат страницу: ${page} · запуск секций быстрый — держит другой код: ядро, сторонние скрипты`,
      ),
    ];
  return heavy.map((entry) =>
    finding(
      'tbt',
      entry.section,
      `запуск ${entry.ms} мс`,
      `Запуск секции держит страницу ${entry.ms} мс: ${page} · тяжёлую работу раздели на части или отложи до показа секции`,
    ),
  );
}

// Сводка Web Vitals черновика рядом с находками (`checks.vitals` ответа снимка): что намерили и пороги платформы —
// MCP своих порогов не держит. CLS — худшее окно загрузки (то же, что у находок), сдвигов нет — 0; элемента LCP нет — null.
export interface VitalsSummary {
  device: LookDevice;
  cls: number;
  tbtMs: number;
  limits: { cls: number; tbtMs: number };
  lcp: { section: string | null; where: string } | null;
}

function vitalsSummary(raw: Raw, device: LookDevice): VitalsSummary {
  const limits = VITALS_LIMITS[device];
  return {
    device,
    cls: worstWindow(loadShifts(raw)).value,
    tbtMs: totalBlocking(raw),
    limits: { cls: limits.cls, tbtMs: limits.tbt },
    lcp: raw.lcp === null ? null : { section: raw.lcp.section, where: raw.lcp.where },
  };
}

// Находки и сводка Web Vitals по тому, что отдала страница (`VITALS_READ` и замедление ЦП). Ответ не по форме — ошибка:
// проверка не отработала, а не «находок нет».
export function vitalsCheck(raw: unknown, device: LookDevice): { findings: CheckFinding[]; vitals: VitalsSummary } {
  const parsed = VitalsRaw.parse(raw);
  return {
    findings: grouped([...clsFindings(parsed, device), ...lcpFindings(parsed), ...tbtFindings(parsed, device)]),
    vitals: vitalsSummary(parsed, device),
  };
}

export const vitalsFindings = (raw: unknown, device: LookDevice): CheckFinding[] => vitalsCheck(raw, device).findings;
