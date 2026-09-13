/**
 * Гард начертаний: КАЖДОЕ форматируемое поле КАЖДОЙ секции КАЖДОЙ из пяти тем.
 *
 * Зачем отдельный тест, если `rich-text-bold-italic.spec.ts` уже зелёный.
 * Тот проверяет ХЕЛПЕР `inlineFormat`. Он был зелёным и 13.09, когда тестер
 * прислал K4: «в заголовке секции печатается <strong><em>Коллекция
 * товаров</em></strong>». Потому что дыра была не в хелпере, а в том, что его
 * НЕ ЗВАЛИ из конкретного поля конкретного порта. Rich-text чинили трижды
 * (0d8117d9, 54823834, 12177f56) и трижды возвращались: правили ровно то поле,
 * на которое пожаловался тестер. Здесь сторожится КЛАСС.
 *
 * Что меряем. Список полей берётся не руками, а из рабочего puck-конфига темы
 * (`ThemePuckConfigController.getPuckConfig`) — того самого, что видит мерчант
 * в конструкторе. Форматируемое поле = `type: 'aiText'`: единственный контрол
 * с кнопками «Ж»/«К» (constructor/src/components/fields/FieldRenderer.tsx:254
 * → AITextInput, единственный потребитель lib/textFormat). Поэтому НОВОЕ поле,
 * заведённое в puckConfig, попадает в проверку САМО — вот это и есть защита от
 * четвёртого рецидива.
 *
 * Как меряем. `render-theme-sections.mjs --live --cascade`, то есть ровно той
 * цепочкой, что работает в проде: adaptLegacyProps → blockDefaults темы →
 * resolveBlockProps → скомпилированный модуль секции, найденный лестницей
 * витрины (порт темы → пакет темы → theme-base). Голый вызов `inlineFormat`
 * меряет путь, которого в проде нет.
 *
 * Два направления, оба обязательны:
 *   1. `<strong><em>X</em></strong>` доезжает НАСТОЯЩЕЙ разметкой;
 *   2. тот же ввод с `<script>`/`onerror=`/`javascript:` не приносит на витрину
 *      ни скрипта, ни обработчика, ни js-ссылки — и при этом поле не исчезает
 *      молча (иначе «безопасно» достигалось бы выкидыванием ввода).
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const COLLECTOR = resolve(__dirname, "rich-text-coverage.mjs");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

type Row = {
  theme: string;
  block: string;
  field: string;
  marker: string;
  status: string;
  detail: string;
};

/**
 * Нижняя граница инвентаря. Сторожит сам сторож: если контроллер puck-конфига
 * перестанет подниматься или отдаст пустой набор, `describe.each` над пустым
 * списком пройдёт молча — и тест «зелёный», хотя не проверил ничего.
 * Цифры — факт на 2026-09-13 (34 поля × 5 тем, у satin на 2 меньше: у него нет
 * `CollapsibleSection.sections[]`). Растёт — правим осознанно.
 */
const MIN_FIELDS_PER_THEME = 30;
const MIN_BLOCKS_PER_THEME = 15;

const built =
  existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", "rose", "manifest.json"),
  ) &&
  existsSync(resolve(SITES_ROOT, "dist", "astro-blocks", "manifest.json")) &&
  existsSync(
    resolve(
      SITES_ROOT,
      "dist",
      "src",
      "controllers",
      "theme-puck-config.controller.js",
    ),
  );

/**
 * Коллектор запускается ДОЧЕРНИМ процессом: jest здесь CJS без
 * --experimental-vm-modules, а цепочка рендера — скомпилированные ESM-модули
 * секций + рантайм astro. Тот же приём, что в section-html-snapshot.spec.ts.
 */
function collect(theme: string, xss: boolean): Row[] {
  const args = xss ? [COLLECTOR, theme, "--xss"] : [COLLECTOR, theme];
  const raw = execFileSync("node", args, {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(raw) as Row[];
}

describe("начертания «Ж»/«К» доезжают до витрины разметкой", () => {
  const format: Record<string, Row[]> = {};

  beforeAll(() => {
    if (!built) return;
    for (const t of THEMES) format[t] = collect(t, false);
  }, 300_000);

  it("секции и конфиг собраны (pnpm build && build:blocks && build:theme-sections:all)", () => {
    expect(built).toBe(true);
  });

  it.each(THEMES)("%s: инвентарь форматируемых полей не опустел", (theme) => {
    if (!built) return;
    const rows = format[theme];
    expect(rows.length).toBeGreaterThanOrEqual(MIN_FIELDS_PER_THEME);
    expect(new Set(rows.map((r) => r.block)).size).toBeGreaterThanOrEqual(
      MIN_BLOCKS_PER_THEME,
    );
  });

  it.each(THEMES)(
    "%s: каждое форматируемое поле рендерит <strong><em>…</em></strong> разметкой",
    (theme) => {
      if (!built) return;
      // Диагноз строкой на поле: 'raw' — теги видны текстом (жалоба тестера),
      // 'plain' — начертание потеряно, 'absent' — поле не доехало вовсе,
      // 'no-port'/'error'/'pipeline' — сломан сам замер.
      const bad = format[theme]
        .filter((r) => r.status !== "ok")
        .map((r) => `${r.block}.${r.field}: ${r.status} ${r.detail}`.trim());
      expect(bad).toEqual([]);
    },
  );
});

describe("вредоносный ввод мерчанта не доезжает до покупателя", () => {
  const xss: Record<string, Row[]> = {};

  beforeAll(() => {
    if (!built) return;
    for (const t of THEMES) xss[t] = collect(t, true);
  }, 300_000);

  it.each(THEMES)(
    "%s: ни скрипта, ни on*-обработчика, ни javascript:-ссылки из значения поля",
    (theme) => {
      if (!built) return;
      // 'xss' — находка (дыра), 'dropped' — поле молча исчезло: так «безопасно»
      // достигается выкидыванием ввода, и это тоже провал.
      const bad = xss[theme]
        .filter((r) => r.status !== "safe")
        .map((r) => `${r.block}.${r.field}: ${r.status} ${r.detail}`.trim());
      expect(bad).toEqual([]);
    },
  );
});
