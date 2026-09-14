/**
 * Кнопка оплаты «как у Shopify»: её видно всегда.
 *
 * ОТКУДА ВЗЯЛОСЬ. Когда схема перестала заливать левую колонку (владелец:
 * «левая часть от нас, там только меняется цвет кнопки»), кнопка осталась на
 * паре токенов схемы — а пары в темах собраны под ФОН ТОЙ ЖЕ СХЕМЫ. На фоне
 * темы светлая кнопка тёмной схемы сливается. Замер собранных витрин
 * (Chromium, 1440×900, 13-14.09) — 7 связок из 21 давали плашку в цвет колонки:
 *   rose scheme-4        кнопка 255,255,255 на колонке 255,255,255 → 1.00:1
 *   satin scheme-4       кнопка 255,255,255 на колонке 255,255,255 → 1.00:1
 *   bloom scheme-1       кнопка 255,255,255 на колонке 255,255,255 → 1.00:1
 *   bloom scheme-2       кнопка 255,255,255 на колонке 255,255,255 → 1.00:1
 *   vanilla scheme-1/3/4 кнопка  58,69,48  на колонке  58,69,48   → 1.00:1
 * У vanilla это ТРИ схемы из четырёх: её колонка сама тёмно-зелёная, и ровно
 * этот же зелёный лежит в `--color-button-bg`.
 *
 * ЧТО ТРЕБУЕТСЯ (владелец, 14.09, «делаем как у Shopify»):
 *   1) плашка заметна на фоне колонки — WCAG ≥ 3:1;
 *   2) подпись контрастна плашке — WCAG ≥ 4.5:1, считается по яркости, а не
 *      «мерчант сам подобрал»;
 *   3) цвет всё ещё приходит ИЗ СХЕМЫ, а не из темы.
 *
 * ЧТО СТОРОЖИТ ЭТОТ ФАЙЛ. Настоящий расчёт контраста по матрице «5 тем × все
 * схемы темы × правдоподобные фоны колонки», а не пара точечных примеров.
 * Исполняется РОВНО тот текст функции, который уходит в кадр
 * (`CHECKOUT_BUTTON_CONTRAST_SOURCE` инлайнится в блок) — копия разъехалась бы
 * с оригиналом молча. Тот же приём, что у PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CHECKOUT_BUTTON_CONTRAST_SOURCE,
} from '../../../packages/theme-base/runtime/checkout-button-contrast';

const SITES_ROOT = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(SITES_ROOT, rel), 'utf8');

type Rgb = [number, number, number];
interface Roles {
  buttonBg?: string;
  buttonText?: string;
  accent?: string;
  heading?: string;
  bg?: string;
  text?: string;
  button2Bg?: string;
}
interface Result {
  plate: Rgb;
  label: Rgb;
  source: string;
  shaded: boolean;
  plateRatio: number;
  labelRatio: number;
}

const pick = new Function(
  `${CHECKOUT_BUTTON_CONTRAST_SOURCE}; return __merfyCheckoutButtonColors;`,
)() as (roles: Roles, columnBg: string) => Result;

/** Тот же расчёт коэффициента, что внутри — но отдельной копией, для сверки. */
const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: Rgb, b: Rgb) => {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const triple = (s: string): Rgb => {
  const p = s.trim().split(/\s+/).map(Number);
  return [p[0], p[1], p[2]];
};

const MIN_PLATE = 3;
const MIN_LABEL = 4.5;

// ── Матрица: реальные токены пяти тем ─────────────────────────────────────

interface Scheme {
  id: string;
  tokens: Record<string, string>;
}
const THEMES = ['rose', 'vanilla', 'flux', 'satin', 'bloom'] as const;

/**
 * Фон левой колонки, снятый в браузере на собранных витринах (13-14.09):
 * четыре темы белые, vanilla тёмно-зелёная. Это НЕ единственное, на чём стоит
 * гард: ниже к каждой теме добавляются фоны всех её схем плюс чистые белый и
 * чёрный, потому что инвариант нужен «на любом фоне колонки», а не на одном
 * замеренном. Замер тут для того, чтобы проблемные связки владельца
 * проверялись ровно на их настоящем фоне.
 */
const MEASURED_COLUMN_BG: Record<string, string> = {
  rose: '255 255 255',
  vanilla: '58 69 48',
  flux: '255 255 255',
  satin: '255 255 255',
  bloom: '255 255 255',
};

function schemesOf(theme: string): Scheme[] {
  const json = JSON.parse(read(`packages/theme-${theme}/theme.json`)) as {
    colorSchemes?: Scheme[];
  };
  const list = json.colorSchemes ?? [];
  expect(list.length).toBeGreaterThan(0); // тема без схем — молчащая матрица
  return list;
}

function rolesOf(s: Scheme): Roles {
  const t = s.tokens ?? {};
  return {
    buttonBg: t['--color-button-bg'],
    buttonText: t['--color-button-text'],
    accent: t['--color-accent'],
    heading: t['--color-heading'],
    bg: t['--color-bg'],
    text: t['--color-text'],
    button2Bg: t['--color-button-2-bg'],
  };
}

/** Фоны колонки, на которых проверяем тему: замеренный + все фоны её схем + края. */
function columnBgsOf(theme: string, schemes: Scheme[]): string[] {
  const set = new Set<string>([MEASURED_COLUMN_BG[theme], '255 255 255', '0 0 0']);
  for (const s of schemes) {
    const bg = s.tokens?.['--color-bg'];
    if (bg) set.add(bg);
  }
  return [...set];
}

// ── 1. Инвариант по всей матрице ──────────────────────────────────────────

describe('кнопка оплаты проходит пороги на всей матрице тем и схем', () => {
  for (const theme of THEMES) {
    const schemes = schemesOf(theme);
    const columns = columnBgsOf(theme, schemes);
    for (const scheme of schemes) {
      for (const col of columns) {
        it(`${theme} ${scheme.id} на колонке ${col}`, () => {
          const out = pick(rolesOf(scheme), col);
          // Считаем независимой копией формул — если внутри функции ошибётся
          // сама арифметика, тест это увидит.
          expect(ratio(out.plate, triple(col))).toBeGreaterThanOrEqual(MIN_PLATE);
          expect(ratio(out.label, out.plate)).toBeGreaterThanOrEqual(MIN_LABEL);
          expect(out.plateRatio).toBeCloseTo(ratio(out.plate, triple(col)), 3);
          expect(out.labelRatio).toBeCloseTo(ratio(out.label, out.plate), 3);
        });
      }
    }
  }
});

// ── 2. Цвет остаётся из схемы ─────────────────────────────────────────────

describe('плашка берётся из схемы, а не из темы', () => {
  for (const theme of THEMES) {
    const schemes = schemesOf(theme);
    for (const scheme of schemes) {
      it(`${theme} ${scheme.id}: источник — роль этой же схемы`, () => {
        const roles = rolesOf(scheme);
        const out = pick(roles, MEASURED_COLUMN_BG[theme]);
        const own = Object.values(roles).filter(Boolean) as string[];
        if (out.shaded) {
          // Затенение допускается ТОЛЬКО как последний шаг и только от цвета
          // схемы: оттенок сохраняется, значит цвет всё ещё «из схемы».
          expect(own.map(triple).some((c) => sameHue(c, out.plate))).toBe(true);
        } else {
          expect(own).toContain(out.plate.join(' '));
        }
      });
    }
  }
});

/** Оттенок сохранён: канал-максимум и канал-минимум те же (затенение — масштаб). */
function sameHue(a: Rgb, b: Rgb): boolean {
  const order = (c: Rgb) =>
    c
      .map((v, i) => [v, i] as const)
      .sort((x, y) => x[0] - y[0])
      .map(([, i]) => i)
      .join('');
  return order(a) === order(b);
}

// ── 3. Что уже было в порядке — не трогаем ────────────────────────────────
//
// Регресс «покрасили всё подряд» страшнее исходной беды: 14 связок из 21
// работали, и кнопка в них обязана остаться ровно той же.

describe('связки, где контраста хватало, остаются без изменений', () => {
  const UNCHANGED: [string, string][] = [
    ['rose', 'scheme-1'],
    ['rose', 'scheme-2'],
    ['rose', 'scheme-3'],
    ['rose', 'scheme-5'],
    ['vanilla', 'scheme-2'],
    ['flux', 'scheme-1'],
    ['flux', 'scheme-2'],
    ['flux', 'scheme-3'],
    ['flux', 'scheme-4'],
    ['satin', 'scheme-1'],
    ['satin', 'scheme-2'],
    ['satin', 'scheme-3'],
    ['bloom', 'scheme-3'],
    ['bloom', 'scheme-4'],
  ];
  for (const [theme, id] of UNCHANGED) {
    it(`${theme} ${id}: плашка = --color-button-bg темы`, () => {
      const scheme = schemesOf(theme).find((s) => s.id === id)!;
      const roles = rolesOf(scheme);
      const out = pick(roles, MEASURED_COLUMN_BG[theme]);
      expect(out.source).toBe('button-bg');
      expect(out.shaded).toBe(false);
      expect(out.plate.join(' ')).toBe(roles.buttonBg);
    });
  }

  /**
   * Подпись — отдельно от плашки. Она сохраняется у 12 связок из 14, но у
   * bloom scheme-3 и scheme-4 белый текст на розовой плашке 207,122,139 даёт
   * 3.08:1 — ниже AA (4.5:1). Требование владельца прямое: «подпись
   * контрастна заливке, Shopify вычисляет это сам, а не полагается на то, что
   * мерчант подобрал пару». Значит белая подпись там обязана стать чёрной
   * (6.81:1), и это ЕДИНСТВЕННОЕ изменение вида в «хороших» связках.
   */
  it('подпись мерчанта сохраняется всюду, кроме двух нечитаемых пар bloom', () => {
    const relabelled: string[] = [];
    for (const [theme, id] of UNCHANGED) {
      const roles = rolesOf(schemesOf(theme).find((s) => s.id === id)!);
      const out = pick(roles, MEASURED_COLUMN_BG[theme]);
      if (out.label.join(' ') !== roles.buttonText) relabelled.push(`${theme} ${id}`);
    }
    expect(relabelled).toEqual(['bloom scheme-3', 'bloom scheme-4']);
  });

  it('bloom scheme-3/4: белая подпись была 3.08:1, стала чёрной 6.81:1', () => {
    for (const id of ['scheme-3', 'scheme-4']) {
      const roles = rolesOf(schemesOf('bloom').find((s) => s.id === id)!);
      const plate = triple(roles.buttonBg!);
      expect(ratio(triple(roles.buttonText!), plate)).toBeLessThan(MIN_LABEL);
      const out = pick(roles, MEASURED_COLUMN_BG.bloom);
      expect(out.label.join(' ')).toBe('0 0 0');
      expect(out.labelRatio).toBeGreaterThanOrEqual(MIN_LABEL);
    }
  });
});

// ── 4. САБОТАЖ: прежняя логика обязана падать на тех же связках ───────────
//
// Без этого блока гард ничего не доказывает: он был бы зелёным и до правки.

describe('САБОТАЖ: прежняя логика (плашка = --color-button-bg как есть)', () => {
  const BROKEN: [string, string][] = [
    ['rose', 'scheme-4'],
    ['satin', 'scheme-4'],
    ['bloom', 'scheme-1'],
    ['bloom', 'scheme-2'],
    ['vanilla', 'scheme-1'],
    ['vanilla', 'scheme-3'],
    ['vanilla', 'scheme-4'],
  ];
  for (const [theme, id] of BROKEN) {
    it(`${theme} ${id}: сырой --color-button-bg ниже порога, починка его поднимает`, () => {
      const scheme = schemesOf(theme).find((s) => s.id === id)!;
      const roles = rolesOf(scheme);
      const col = triple(MEASURED_COLUMN_BG[theme]);
      const raw = ratio(triple(roles.buttonBg!), col);
      expect(raw).toBeLessThan(MIN_PLATE); // так было
      const out = pick(roles, MEASURED_COLUMN_BG[theme]);
      expect(out.plateRatio).toBeGreaterThanOrEqual(MIN_PLATE); // так стало
      expect(out.source).not.toBe('button-bg');
    });
  }

  it('затенение — крайняя мера: срабатывает ровно там, где ни одна роль не тянет', () => {
    // bloom scheme-2 на белой колонке: лучшая роль даёт 2.43:1, порога нет ни у
    // одной. Если завтра затенение начнёт срабатывать где-то ещё — значит
    // матрица ролей поехала, и это надо увидеть, а не проспать.
    const shaded: string[] = [];
    for (const theme of THEMES) {
      for (const scheme of schemesOf(theme)) {
        if (pick(rolesOf(scheme), MEASURED_COLUMN_BG[theme]).shaded) {
          shaded.push(`${theme} ${scheme.id}`);
        }
      }
    }
    expect(shaded).toEqual(['bloom scheme-2']);
  });
});

// ── 4-бис. ЦВЕТ КНОПКИ, ВЫБРАННЫЙ МЕРЧАНТОМ, НЕ ВЫБРАСЫВАЕТСЯ ────────────
//
// Жалоба 15.09: «в левой части не применяется цветовая схема к кнопке». Замер
// собранной витрины пяти тем (Chromium 1440×1400): мерчант задал в палитре
// схемы «Фон» #71C0FF = 113 192 255 и «кнопку» #B722B0 = 183 34 176, а на
// кнопке оказалось `--color-button-bg` = 0 0 0 (rose, bloom), 38 49 28
// (vanilla), 8 2 0 (satin), 11 11 11 (flux) — атрибут
// data-checkout-submit-contrast показывал button-2-bg / heading.
//
// Причина: пурпур мерчанта даёт к светло-голубой колонке 2.76:1 — не хватило
// 0.24 до порога 3:1, и шаг ② отдавал вместо него чужую роль схемы. Вместе с
// disabled:opacity-50 (корзина пуста) почти чёрная плашка читалась серой, и
// выбор мерчанта на экране не появлялся вовсе.
//
// Теперь такой цвет ЗАТЕНЯЕТСЯ до порога с сохранением оттенка. Отличать от
// «цвета, который ничего не значит», можно точно: у всех СЕМИ заводских связок
// (см. блок САБОТАЖ выше) --color-button-bg побайтно равен фону колонки —
// контраст ровно 1.00, манхэттен ровно 0.
const MERCHANT_COLUMN = '113 192 255';
const MERCHANT_BUTTON = '183 34 176';

describe('цвет кнопки из палитры схемы доезжает до кнопки', () => {
  for (const theme of THEMES) {
    it(`${theme}: выбранный мерчантом цвет остаётся собой, а не подменяется ролью`, () => {
      const scheme = schemesOf(theme)[0];
      const roles = { ...rolesOf(scheme), buttonBg: MERCHANT_BUTTON, bg: MERCHANT_COLUMN };
      const out = pick(roles, MERCHANT_COLUMN);
      expect(out.source).toBe('button-bg');
      expect(out.plateRatio).toBeGreaterThanOrEqual(MIN_PLATE);
      // оттенок сохранён: порядок каналов тот же, что у цвета мерчанта
      expect(sameHue(out.plate, triple(MERCHANT_BUTTON))).toBe(true);
      // и это всё ещё пурпур, а не «почти чёрный»: красный канал выше синего у
      // подменных ролей был бы нулевым.
      expect(out.plate[0]).toBeGreaterThan(120);
      expect(out.plate[2]).toBeGreaterThan(120);
      expect(out.plate[1]).toBeLessThan(80);
    });
  }

  it('сырой цвет мерчанта не дотягивал 0.24 до порога — цифра, ради которой всё', () => {
    const raw = ratio(triple(MERCHANT_BUTTON), triple(MERCHANT_COLUMN));
    expect(raw).toBeLessThan(MIN_PLATE);
    expect(raw).toBeGreaterThan(2.7);
  });

  it('подпись пересчитывается по яркости получившейся плашки', () => {
    const out = pick({ buttonBg: MERCHANT_BUTTON, buttonText: '255 255 255' }, MERCHANT_COLUMN);
    expect(out.labelRatio).toBeGreaterThanOrEqual(MIN_LABEL);
  });

  it('цвет кнопки, РАВНЫЙ фону колонки, по-прежнему подменяется ролью', () => {
    // Иначе починка съела бы то, ради чего расчёт заводился: заводская пара,
    // собранная под исчезнувшую поверхность, стала бы кнопкой-невидимкой.
    const out = pick(
      { buttonBg: '255 255 255', buttonText: '0 0 0', bg: '0 0 0', text: '0 0 0' },
      '255 255 255',
    );
    expect(out.source).not.toBe('button-bg');
    expect(out.plateRatio).toBeGreaterThanOrEqual(MIN_PLATE);
  });

  it('САБОТАЖ: вернули подмену роли для цвета мерчанта → кнопка снова не пурпурная', () => {
    // Прежняя логика дословно: ниже порога → сразу шаг ②, оттенок не сохраняем.
    const прежняя = new Function(
      `${CHECKOUT_BUTTON_CONTRAST_SOURCE.replace(
        'if (plate && !sameAsColumn && ratio(plate, column) < MIN_PLATE) {',
        'if (false) {',
      )}; return __merfyCheckoutButtonColors;`,
    )() as (roles: Roles, columnBg: string) => Result;
    const roles = { ...rolesOf(schemesOf('rose')[0]), buttonBg: MERCHANT_BUTTON, bg: MERCHANT_COLUMN };
    const было = прежняя(roles, MERCHANT_COLUMN);
    const стало = pick(roles, MERCHANT_COLUMN);
    expect(было.source).not.toBe('button-bg');
    expect(sameHue(было.plate, triple(MERCHANT_BUTTON))).toBe(false);
    expect(стало.source).toBe('button-bg');
  });

  it('САБОТАЖ-КАЛИБРОВКА: связка, которой контраста хватало, не трогается вовсе', () => {
    // rose scheme-1 на белой колонке: чёрная кнопка 21:1 — ни затенения, ни
    // подмены быть не должно. Если бы предикат краснел и здесь, он сторожил бы
    // «что угодно».
    const roles = rolesOf(schemesOf('rose')[0]);
    const out = pick(roles, '255 255 255');
    expect(out.source).toBe('button-bg');
    expect(out.shaded).toBe(false);
    expect(out.plate.join(' ')).toBe(roles.buttonBg);
  });
});

// ── 5. Поведение функции в одиночку ───────────────────────────────────────

describe('расчёт сам по себе', () => {
  it('подпись мерчанта сохраняется, если читаема', () => {
    const out = pick({ buttonBg: '0 0 0', buttonText: '255 255 255' }, '255 255 255');
    expect(out.label.join(' ')).toBe('255 255 255');
  });

  it('нечитаемая подпись пересчитывается по яркости плашки', () => {
    // чёрная подпись на чёрной плашке → обязана стать белой
    const out = pick({ buttonBg: '0 0 0', buttonText: '0 0 0' }, '255 255 255');
    expect(out.label.join(' ')).toBe('255 255 255');
    expect(out.labelRatio).toBeGreaterThanOrEqual(MIN_LABEL);
  });

  it('светлая плашка получает тёмную подпись', () => {
    const out = pick({ buttonBg: '255 255 255', buttonText: '255 255 255' }, '0 0 0');
    expect(out.plate.join(' ')).toBe('255 255 255');
    expect(out.label.join(' ')).toBe('0 0 0');
  });

  it('мусор на входе не роняет рендер', () => {
    const out = pick({}, '');
    expect(out.plate).toHaveLength(3);
    expect(out.label).toHaveLength(3);
    expect(Number.isFinite(out.plateRatio)).toBe(true);
  });
});

// ── 6. Разводка: расчёт реально уезжает в блок ────────────────────────────

describe('расчёт доезжает до кнопки', () => {
  it('блок инлайнит ровно этот исходник', () => {
    const src = read('packages/theme-base/blocks/CheckoutSubmit/CheckoutSubmit.astro');
    expect(src).toContain('CHECKOUT_BUTTON_CONTRAST_SOURCE');
    expect(src).toContain('__merfyCheckoutButtonColors');
  });

  it('результат кладётся в токены кнопки, а не в inline-style мимо hover', () => {
    // Через --color-button-bg/-text работают и обычное, и hover-состояние —
    // иначе при наведении кнопка возвращала бы невидимый цвет.
    const src = read('packages/theme-base/blocks/CheckoutSubmit/CheckoutSubmit.astro');
    expect(src).toContain('--color-button-bg');
    expect(src).toContain('--color-button-bg-hover');
    expect(src).toContain('--color-button-text-hover');
  });

  it('панель не получила новых полей (состав параметров — канон)', () => {
    const cfg = read('packages/theme-base/blocks/CheckoutSubmit/CheckoutSubmit.puckConfig.ts');
    expect(cfg).not.toMatch(/contrast|accessib|plate/i);
  });
});
