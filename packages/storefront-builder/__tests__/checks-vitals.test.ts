// Web Vitals в месте `browser` (`checks/browser/vitals.ts`): CLS загрузки и секция-виновник, главный элемент первого
// экрана, TBT и запуск секций. Настоящий замер в Chromium — `look-vitals-browser.test.ts`.
import { describe, expect, it } from 'vitest';
import {
  cpuRateFor,
  loadShifts,
  mountTimes,
  totalBlocking,
  vitalsFindings,
  worstWindow,
  type VitalsRaw,
} from '../src/checks/browser/vitals';

const clean: VitalsRaw = {
  shifts: [],
  lcp: null,
  long: [],
  mounts: [],
  fcp: 100,
  loadedAt: 3_000,
  readAt: 5_000,
  cpuRate: 4,
};

type Shift = VitalsRaw['shifts'][number];
const shift = (t: number, value: number, patch: Partial<Shift> = {}): Shift => ({
  value,
  t,
  input: false,
  section: 'hero-1',
  where: 'секция выросла на 300 px',
  ...patch,
});

const lcp = (patch: Partial<NonNullable<VitalsRaw['lcp']>> = {}): NonNullable<VitalsRaw['lcp']> => ({
  t: 400,
  section: 'hero-1',
  where: 'img hero.jpg',
  kind: 'image',
  lazy: false,
  srcByScript: false,
  shownByScript: false,
  insertedByScript: false,
  ...patch,
});

const FIX = 'задай место заранее: width и height у картинок, высоту у блоков, которые появляются после загрузки';

describe('CLS: окна сдвигов', () => {
  it('перерыв больше 1 с начинает новое окно; CLS — наибольшее', () => {
    const worst = worstWindow([shift(1_700, 0.08), shift(0, 0.05), shift(500, 0.05)]);
    expect(worst.value).toBeCloseTo(0.1);
    expect(worst.shifts.map((entry) => entry.t)).toEqual([0, 500]);
  });

  it('окно не длиннее 5 с: сдвиг дальше 5 с от начала окна начинает новое', () => {
    const steady = [0, 900, 1_800, 2_700, 3_600, 4_500, 5_400].map((t) => shift(t, 0.02));
    const worst = worstWindow(steady);
    expect(worst.shifts.map((entry) => entry.t)).toEqual([0, 900, 1_800, 2_700, 3_600, 4_500]);
    expect(worst.value).toBeCloseTo(0.12);
  });

  it('сдвигов нет — 0', () => {
    expect(worstWindow([])).toEqual({ value: 0, shifts: [] });
  });
});

describe('CLS: сдвиги загрузки (как считает Lighthouse)', () => {
  it('помеченные «вводом» считаются, пока не пришёл сдвиг без флага; после конца загрузки — не считаются', () => {
    const counted = loadShifts({
      loadedAt: 3_000,
      shifts: [
        shift(400, 0.3, { input: true }),
        shift(200, 0.05, { input: true }),
        shift(100, 0.1, { input: true }),
        shift(300, 0.02),
        shift(3_500, 0.4),
      ],
    });
    expect(counted.map((entry) => entry.t)).toEqual([100, 200, 300]);
  });

  it('метки конца загрузки нет — все сдвиги до чтения', () => {
    expect(loadShifts({ loadedAt: null, shifts: [shift(3_500, 0.4)] })).toHaveLength(1);
  });

  it('телефон: прыжок в первые 0,5 с с флагом от эмуляции экрана — находка', () => {
    const found = vitalsFindings({ ...clean, shifts: [shift(408, 0.14, { input: true })] }, 'mobile');
    expect(found.map((finding) => [finding.rule, finding.section])).toEqual([['cls', 'hero-1']]);
  });
});

describe('CLS: находки', () => {
  it('выше нормы — находка каждой секции с долей не меньше 0,01; where — её самый крупный сдвиг', () => {
    const found = vitalsFindings(
      {
        ...clean,
        shifts: [
          shift(500, 0.05, { where: 'секция выросла на 100 px' }),
          shift(520, 0.16, { where: 'секция выросла на 321 px' }),
          shift(600, 0.02, { section: 'list-1', where: 'div «Шарф 1»' }),
          shift(650, 0.005, { section: 'fast-1', where: 'p «Быстрый»' }),
        ],
      },
      'mobile',
    );
    expect(found).toEqual([
      {
        place: 'browser',
        check: 'vitals',
        rule: 'cls',
        level: 'warning',
        section: 'hero-1',
        where: 'секция выросла на 321 px',
        text: `Вёрстка прыгает при загрузке: CLS 0,24 при норме до 0,10, из-за этой секции 0,21 · ${FIX}`,
        count: 1,
      },
      {
        place: 'browser',
        check: 'vitals',
        rule: 'cls',
        level: 'warning',
        section: 'list-1',
        where: 'div «Шарф 1»',
        text: `Вёрстка прыгает при загрузке: CLS 0,24 при норме до 0,10, из-за этой секции 0,02 · ${FIX}`,
        count: 1,
      },
    ]);
  });

  it('ровно норма (0,10) — не находка', () => {
    expect(vitalsFindings({ ...clean, shifts: [shift(500, 0.1)] }, 'desktop')).toEqual([]);
  });

  it('сдвиг вне секций — находка страницы без доли', () => {
    const [found] = vitalsFindings(
      { ...clean, shifts: [shift(500, 0.15, { section: null, where: 'страница' })] },
      'mobile',
    );
    expect(found?.section).toBeNull();
    expect(found?.text).toBe(`Вёрстка прыгает при загрузке: CLS 0,15 при норме до 0,10 · ${FIX}`);
  });
});

describe('главный элемент первого экрана', () => {
  it('одна находка — самая важная причина: вставлен скриптом > скрыт > адрес скриптом > фон > ленивый', () => {
    const order: Array<[Partial<NonNullable<VitalsRaw['lcp']>>, string | null]> = [
      [
        { insertedByScript: true, shownByScript: true, srcByScript: true, kind: 'background', lazy: true },
        'lcp-inserted',
      ],
      [{ shownByScript: true, srcByScript: true, kind: 'background', lazy: true }, 'lcp-hidden'],
      [{ srcByScript: true, kind: 'background', lazy: true }, 'lcp-src-script'],
      [{ kind: 'background', lazy: true }, 'lcp-background'],
      [{ lazy: true }, 'lcp-lazy'],
      [{}, null],
    ];
    for (const [patch, rule] of order) {
      const found = vitalsFindings({ ...clean, lcp: lcp(patch) }, 'mobile');
      expect(found.map((finding) => finding.rule)).toEqual(rule === null ? [] : [rule]);
    }
  });

  it('находка — у секции и элемента LCP, с текстом «что не так · как починить»', () => {
    expect(vitalsFindings({ ...clean, lcp: lcp({ lazy: true }) }, 'mobile')).toEqual([
      {
        place: 'browser',
        check: 'vitals',
        rule: 'lcp-lazy',
        level: 'warning',
        section: 'hero-1',
        where: 'img hero.jpg',
        text: 'Главная картинка первого экрана грузится лениво (loading="lazy") · убери loading="lazy": она нужна сразу',
        count: 1,
      },
    ]);
  });

  it('элемента LCP нет или это обычный текст — находок нет', () => {
    expect(vitalsFindings(clean, 'mobile')).toEqual([]);
    expect(vitalsFindings({ ...clean, lcp: lcp({ kind: 'text', where: 'h1 «Шарфы»' }) }, 'mobile')).toEqual([]);
  });
});

describe('TBT', () => {
  it('задача обрезается окном «первая отрисовка — конец загрузки», считается то, что в окне сверх 50 мс', () => {
    const tbt = totalBlocking({
      fcp: 100,
      loadedAt: 1_000,
      readAt: 9_000,
      long: [
        { t: 50, d: 200 }, // в окне 100–250: 150 → 100
        { t: 60, d: 80 }, // в окне 100–140: 40 → 0
        { t: 900, d: 300 }, // в окне 900–1000: 100 → 50
        { t: 1_500, d: 500 }, // после конца загрузки
      ],
    });
    expect(tbt).toBe(150);
  });

  it('нет первой отрисовки — окно с начала; нет метки загрузки — до чтения', () => {
    expect(totalBlocking({ fcp: null, loadedAt: null, readAt: 2_000, long: [{ t: 1_500, d: 300 }] })).toBe(250);
  });

  it('время запуска секции — промежуток между событиями внутри одной длинной задачи; первое событие пропускается', () => {
    const times = mountTimes({
      long: [{ t: 90, d: 345 }],
      mounts: [
        { t: 100, ids: ['top-1'] },
        { t: 105, ids: ['hero-1'] },
        { t: 425, ids: ['slow-1'] },
        { t: 430, ids: ['fast-1', 'fast-2'] },
        { t: 2_000, ids: ['late-1'] },
      ],
    });
    expect(times).toEqual([
      { section: 'hero-1', ms: 5 },
      { section: 'slow-1', ms: 320 },
    ]);
  });

  it('выше нормы и тяжёлый запуск секции — находка этой секции', () => {
    const raw = {
      ...clean,
      fcp: 80,
      long: [{ t: 90, d: 345 }],
      mounts: [
        { t: 100, ids: ['top-1'] },
        { t: 420, ids: ['slow-1'] },
        { t: 425, ids: ['fast-1'] },
      ],
    };
    expect(vitalsFindings(raw, 'mobile')).toEqual([
      {
        place: 'browser',
        check: 'vitals',
        rule: 'tbt',
        level: 'warning',
        section: 'slow-1',
        where: 'запуск 320 мс',
        text:
          'Запуск секции держит страницу 320 мс: TBT 295 мс при норме до 200 (ЦП замедлен ×4, как у телефона в ' +
          'Lighthouse) · тяжёлую работу раздели на части или отложи до показа секции',
        count: 1,
      },
    ]);
  });

  it('норма у компьютера строже (150 мс), без замедления ЦП — без пометки о нём', () => {
    const raw = { ...clean, cpuRate: 1, long: [{ t: 200, d: 230 }] };
    expect(vitalsFindings(raw, 'mobile')).toEqual([]);
    const [found] = vitalsFindings(raw, 'desktop');
    expect(found).toMatchObject({ rule: 'tbt', section: null, where: 'страница' });
    expect(found?.text).toBe(
      'Скрипты держат страницу: TBT 180 мс при норме до 150 · запуск секций быстрый — держит другой код: ядро, ' +
        'сторонние скрипты',
    );
  });
});

describe('замедление ЦП телефона по скорости машины (таблица Lighthouse)', () => {
  it('индекс 1500 и выше — ×4, 1000–1500 — ×2, слабее — без замедления', () => {
    expect([2_400, 1_500, 1_499, 1_000, 999, 0].map(cpuRateFor)).toEqual([4, 4, 2, 2, 1, 1]);
  });
});

describe('ответ страницы не по форме — ошибка, а не «находок нет»', () => {
  it('нет поля, чужой тип, нулевое замедление', () => {
    expect(() => vitalsFindings({ ...clean, readAt: undefined }, 'mobile')).toThrow();
    expect(() => vitalsFindings({ ...clean, shifts: [{ value: 0.2, t: 1 }] }, 'mobile')).toThrow();
    expect(() => vitalsFindings({ ...clean, cpuRate: 0 }, 'mobile')).toThrow();
    expect(() => vitalsFindings(null, 'mobile')).toThrow();
  });
});
