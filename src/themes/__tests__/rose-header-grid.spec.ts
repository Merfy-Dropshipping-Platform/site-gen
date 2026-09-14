/**
 * Гард сетки шапки rose (баг тестировщика 14.09: «Шапка в теме Rose не по сетке»).
 *
 * ЧТО ЛОВИМ. Канон горизонтальной сетки rose — ДВА уровня, одинаковые у секций
 * главной и у подвала:
 *   1) внешний элемент несёт ЛЕСТНИЦУ боковых отступов
 *      `px-4 sm:px-5 md:px-10 lg:px-16 xl:px-20 2xl:px-[280px]`;
 *   2) внутри — РЕЛЬС контента `mx-auto w-full max-w-[1320px]`.
 * Шапка второй уровень потеряла: её ряд был `mx-auto flex max-w-[1920px]` + та же
 * лестница, но БЕЗ внутреннего `max-w-[1320px]`. Пока `vw − 2·pad ≤ 1320`
 * (в том числе ровно на 1440) расхождения не видно, а дальше шапка растягивается
 * шире секций. Замер браузером (Playwright, 2026-09-14), край содержимого шапки
 * против края контента секций, ДО правки:
 *   390  → шапка 16/374   секции 16/374    Δ 0
 *   1440 → шапка 80/1360  секции 80/1360   Δ 0
 *   1512 → шапка 80/1432  секции 96/1416   Δ 16px
 *   1920 → шапка 280/1640 секции 300/1620  Δ 20px
 * ПОСЛЕ правки Δ = 0 на всех четырёх.
 *
 * КАК ПРОВЕРЯЕМ. Браузера в CI нет, поэтому тест читает исходники порта
 * `themes/rose/src` — единственный рендер-путь rose и для живой витрины
 * (`dist/theme-live/rose`), и для превью конструктора (`dist/theme-sections/rose`):
 * `themes/rose/sections.map.json` сопоставляет блок `Header` именно этому файлу,
 * а `rose` входит в `MIGRATED_THEMES` (`src/generator/build.service.ts`).
 * Тест сверяет три вещи:
 *   1. модуль канона `themes/rose/src/lib/container.ts` совпадает с числами,
 *      снятыми с секции главной (секция — источник истины про сетку);
 *   2. оба десктопных ряда шапки обёрнуты внутренним рельсом;
 *   3. расчётные левый/правый края шапки равны краям секции (допуск 1px)
 *      на лестнице вьюпортов, включая 390 и 1440 из задачи и широкие 1512/1920,
 *      где баг и проявлялся.
 *
 * САБОТАЖ (обязан краснеть): сдвинуть любой отступ в `ROSE_RAIL_PAD`
 * (например `xl:px-20` → `xl:px-24`), поменять 1320 в `ROSE_RAIL_INNER`
 * или убрать обёртку внутреннего рельса из ряда шапки.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROSE = join(process.cwd(), "themes", "rose", "src");
const HEADER_SRC = readFileSync(
  join(ROSE, "components", "Header.astro"),
  "utf8",
);
const SECTION_SRC = readFileSync(
  join(ROSE, "components", "sections", "Collections.astro"),
  "utf8",
);
const FOOTER_SRC = readFileSync(
  join(ROSE, "components", "Footer.astro"),
  "utf8",
);
const CANON_SRC = readFileSync(join(ROSE, "lib", "container.ts"), "utf8");

/** Брейкпоинты Tailwind (дефолтные; тема их не переопределяет). */
const BP = {
  base: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;
type BpKey = keyof typeof BP;

/** Горизонтальный рельс: лестница отступов + предельные ширины. */
interface Rail {
  pad: Partial<Record<BpKey, number>>;
  /** `max-w` внутреннего рельса контента; Infinity — рельса нет. */
  innerMax: number;
  /** `max-w` внешнего блока; Infinity — не ограничен. */
  outerMax: number;
}

/** `px-10` → 40px (шкала Tailwind: n × 4px), `px-[280px]` → 280px. */
const spacingToPx = (raw: string): number => {
  const bracket = /^\[(\d+(?:\.\d+)?)px\]$/.exec(raw);
  return bracket ? Number(bracket[1]) : Number(raw) * 4;
};

/** Лестница `px-*` (с префиксами брейкпоинтов) из строки классов. */
const readPadLadder = (classes: string): Partial<Record<BpKey, number>> => {
  const pad: Partial<Record<BpKey, number>> = {};
  const re = /(?:(sm|md|lg|xl|2xl):)?px-(\[\d+(?:\.\d+)?px\]|\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(classes)) !== null)
    pad[(m[1] ?? "base") as BpKey] = spacingToPx(m[2]);
  return pad;
};

/** Значение строковой константы из `container.ts`. */
const canonConst = (name: string): string => {
  const m = new RegExp(`${name}\\s*=\\s*\\n?\\s*"([^"]+)"`).exec(CANON_SRC);
  if (!m)
    throw new Error(`В themes/rose/src/lib/container.ts нет константы ${name}`);
  return m[1];
};

/** Первая строка классов, содержащая полную десктопную лестницу отступов. */
const ladderIn = (src: string): string => {
  const m = /[^"'`\n]*2xl:px-\[\d+px\][^"'`\n]*/.exec(src);
  if (!m)
    throw new Error("Не найдена лестница отступов (якорь 2xl:px-[280px])");
  return m[0];
};

/** Максимум `max-w-[Npx]` в куске разметки (нет совпадений → Infinity). */
const maxWIn = (chunk: string): number => {
  const vals = [...chunk.matchAll(/max-w-\[(\d+)px\]/g)].map((m) =>
    Number(m[1]),
  );
  return vals.length ? Math.max(...vals) : Number.POSITIVE_INFINITY;
};

/** Отступ, действующий на ширине `vw` (последний подошедший брейкпоинт). */
const padAt = (pad: Partial<Record<BpKey, number>>, vw: number): number => {
  let value = 0;
  for (const bp of Object.keys(BP) as BpKey[]) {
    if (vw >= BP[bp] && pad[bp] !== undefined) value = pad[bp];
  }
  return value;
};

/**
 * Края контента рельса на вьюпорте `vw`. Внешний блок центрируется и не шире
 * `outerMax`; отступы съедают по `pad` с каждой стороны; внутренний рельс не
 * шире `innerMax` и центрируется в оставшейся контент-области.
 */
const edges = (rail: Rail, vw: number): { left: number; right: number } => {
  const outerW = Math.min(vw, rail.outerMax);
  const outerLeft = (vw - outerW) / 2;
  const pad = padAt(rail.pad, vw);
  const boxW = outerW - 2 * pad;
  const innerW = Math.min(boxW, rail.innerMax);
  const left = outerLeft + pad + (boxW - innerW) / 2;
  return { left: +left.toFixed(1), right: +(left + innerW).toFixed(1) };
};

// ── Источник истины про сетку — секция главной ───────────────────────────────
const sectionRail: Rail = {
  pad: readPadLadder(ladderIn(SECTION_SRC)),
  innerMax: maxWIn(SECTION_SRC),
  outerMax: Number.POSITIVE_INFINITY,
};

// ── Рельсы шапки, собранные из канон-модуля ──────────────────────────────────
const headerDesktopRail: Rail = {
  pad: readPadLadder(canonConst("ROSE_RAIL_PAD")),
  innerMax: maxWIn(canonConst("ROSE_RAIL_INNER")),
  outerMax: maxWIn(canonConst("ROSE_RAIL_OUTER")),
};
const headerMobileRail: Rail = {
  pad: readPadLadder(canonConst("ROSE_RAIL_PAD_MOBILE")),
  innerMax: Number.POSITIVE_INFINITY,
  outerMax: Number.POSITIVE_INFINITY,
};

const DESKTOP_VIEWPORTS = [1024, 1280, 1440, 1512, 1920, 2560];
const MOBILE_VIEWPORTS = [390, 640, 768, 1023];
const TOLERANCE = 1;

describe("rose: сетка шапки совпадает с сеткой секций", () => {
  it("секция главной несёт канон: лестница отступов + контент 1320px", () => {
    expect(sectionRail.pad).toEqual({
      base: 16,
      sm: 20,
      md: 40,
      lg: 64,
      xl: 80,
      "2xl": 280,
    });
    expect(sectionRail.innerMax).toBe(1320);
  });

  it("подвал собран по тому же канону (контрольный образец внутри темы)", () => {
    expect(readPadLadder(ladderIn(FOOTER_SRC))).toEqual(sectionRail.pad);
    expect(FOOTER_SRC).toContain("max-w-[1320px]");
  });

  it("канон-модуль container.ts повторяет числа секции, а не свои", () => {
    expect(headerDesktopRail.pad).toEqual(sectionRail.pad);
    expect(headerDesktopRail.innerMax).toBe(sectionRail.innerMax);
    expect(canonConst("ROSE_RAIL_OUTER")).toContain(
      canonConst("ROSE_RAIL_PAD"),
    );
    // Мобильная лестница — подмножество общей (ряд живёт только ниже lg).
    for (const [bp, px] of Object.entries(headerMobileRail.pad)) {
      expect(sectionRail.pad[bp as BpKey]).toBe(px);
    }
  });

  it("шапка берёт сетку из канон-модуля, а не из своих чисел", () => {
    expect(HEADER_SRC).toMatch(
      /import\s*\{[^}]*\}\s*from\s*"\.\.\/lib\/container"/,
    );
    // Прежние «свои числа» шапки не вернулись.
    expect(HEADER_SRC).not.toContain("mx-auto flex max-w-[1920px]");
  });

  it("оба десктопных ряда шапки обёрнуты внутренним рельсом контента", () => {
    const desktop = HEADER_SRC.slice(
      HEADER_SRC.indexOf("<!-- Desktop -->"),
      HEADER_SRC.indexOf("<!-- Поиск"),
    );
    const wrapped = [
      ...desktop.matchAll(
        /<div class=\{desktopRowCls\}[^>]*>\s*<div class=\{desktopRail(?:Cls|ColumnCls)\}>/g,
      ),
    ];
    // Двухрядная (top-left / top-center) и однорядная (center-left / center-absolute).
    expect(wrapped).toHaveLength(2);
    expect(HEADER_SRC).toContain("ROSE_RAIL_INNER");
  });

  it.each(DESKTOP_VIEWPORTS)(
    "вьюпорт %ipx: края шапки = края контента секции (допуск 1px)",
    (vw) => {
      const h = edges(headerDesktopRail, vw);
      const s = edges(sectionRail, vw);
      expect(Math.abs(h.left - s.left)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(h.right - s.right)).toBeLessThanOrEqual(TOLERANCE);
    },
  );

  it.each(MOBILE_VIEWPORTS)(
    "вьюпорт %ipx (мобильный ряд): края шапки = края контента секции (допуск 1px)",
    (vw) => {
      const h = edges(headerMobileRail, vw);
      const s = edges(sectionRail, vw);
      expect(Math.abs(h.left - s.left)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(h.right - s.right)).toBeLessThanOrEqual(TOLERANCE);
    },
  );

  it("расчёт краёв откалиброван по замеру браузером (Playwright 2026-09-14)", () => {
    for (const rail of [sectionRail, headerDesktopRail]) {
      expect(edges(rail, 1440)).toEqual({ left: 80, right: 1360 });
      expect(edges(rail, 1512)).toEqual({ left: 96, right: 1416 });
      expect(edges(rail, 1920)).toEqual({ left: 300, right: 1620 });
    }
    expect(edges(headerMobileRail, 390)).toEqual({ left: 16, right: 374 });
    expect(edges(sectionRail, 390)).toEqual({ left: 16, right: 374 });
  });
});
