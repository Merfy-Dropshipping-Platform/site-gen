/**
 * «Контактная форма»: поле «Текст» нашим контролом — во всех пяти темах,
 * с доездом до ВСЕХ ТРЁХ путей рендера.
 *
 * Просьба владельца, 2026-09-15, дословно: «во всех темах в секции Контактная
 * форма добавить наш инпут Текст». «Наш инпут» — это `type: 'aiText'`:
 * единственный контрол с панелькой начертаний («Жирный»/«Курсив») и
 * плейсхолдером «Ввести текст...» (constructor/src/components/fields/
 * FieldRenderer.tsx:254 → AITextInput). Образцы-соседи, с которых снят состав:
 * `Gallery.text`, `Collections.subtitle`, `Catalog.categorySubtitle` — везде
 * `{ type:'aiText', label:'Текст', fieldType:'description',
 *    placeholder:'Ввести текст...' }` в разделе «Содержание» сразу за
 * «Размером заголовка».
 *
 * Состав параметров секций — канон (владелец 2026-09-13), поэтому изменение
 * НЕ рядовое: оно разрешено отдельной просьбой, и `conformance/panel-canon.json`
 * пересниматся отдельным коммитом. Здесь сторожится ровно то, что разрешено, —
 * ОДНО поле и ничего сверх.
 *
 * Почему мало «поле появилось в панели». Панель, которая показывает поле, а
 * введённый текст никуда не попадает, ХУЖЕ отсутствия поля: мерчант печатает,
 * сохраняет и не понимает, почему на сайте пусто. Проп `description` у этой
 * секции ровно в таком состоянии и жил: он был в схеме и в defaultProps, был
 * `type:'hidden'` (контрола нет нигде), и при этом ДВА порта из пяти его не
 * рендерили вовсе — замер 2026-09-15 живой цепочкой: rose absent, bloom absent,
 * satin/flux/vanilla ok. Поэтому проверок две группы, и вторая обязательна.
 *
 * Три пути рендера меряются раздельно, потому что они РАЗНЫЕ по подготовке
 * пропсов (см. contact-form-text-paths.mjs):
 *   1. точечный hot-render блока — POST /preview/block;
 *   2. страница превью конструктора — composeV2Page с префиксом /__theme/<тема>;
 *   3. собранная витрина — та же тройка с корневыми URL.
 * Первый путь не проходит через `extractPageBlocks`, третий не проходит через
 * префиксование URL — «работает в превью, пусто на витрине» ловится только
 * раздельным замером.
 *
 * Чего этот гард НЕ ловит (чтобы на него не полагались шире):
 *   • вид контрола на экране конструктора — он живёт в другом репозитории;
 *     здесь сторожится ЗАКАЗ («aiText»), который конструктор исполняет;
 *   • состав ОСТАЛЬНЫХ панелей — это предмет test:panel-canon;
 *   • экранирование чужого HTML — это предмет test:rich-text-fields (--xss).
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const PATHS_COLLECTOR = resolve(__dirname, "contact-form-text-paths.mjs");
const PANEL_DUMP = resolve(__dirname, "panel-canon.mjs");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

const BLOCK = "ContactForm";
/** Проп, в котором живёт текст секции. Существует с самого её появления. */
const FIELD = "description";
/** Маркер и полезная нагрузка — зеркало contact-form-text-paths.mjs. */
const MARKER = "CFTEXT01Z";

/**
 * Заказ контрола, снятый с полей-соседей («Галерея», «Коллекции», «Каталог»).
 * Формулировки не выдумываются: подпись и плейсхолдер взяты у них дословно.
 */
const WANTED = {
  type: "aiText",
  label: "Текст",
  fieldType: "description",
  placeholder: "Ввести текст...",
} as const;

/**
 * Состав панели ДО правки (замер 2026-09-15 по conformance/panel-canon.json,
 * одинаков во всех пяти темах). Нужен, чтобы сторожить «ровно одно поле
 * сверх» — иначе «добавил Текст» прикрыло бы собой любую соседнюю правку.
 */
const FIELDS_BEFORE = [
  "_contentSection",
  "heading",
  "headingSize",
  "colorScheme",
  "padding",
  "headingAlignment",
  "description",
  "fields",
  "buttonText",
] as const;

/**
 * Состав ПОСЛЕ второй просьбы владельца (2026-09-16, дословно): «под инпутом
 * добавить список размер текста, как сверху с размером заголовка». В отличие от
 * «Текста», здесь прибавляется НОВОЕ имя пропа — `textSize`. Имя не выдумано:
 * так же зовётся это поле у соседей (`Gallery.textSize`, `Collections`), и
 * именно его порт flux читал ещё до просьбы (ContactForm.astro:45). Ровно одно
 * имя сверх — больше ничего.
 */
const FIELDS_AFTER = [...FIELDS_BEFORE, "textSize"] as const;

/** Порядок контролов «Содержания» после правки: Текст идёт за Размером заголовка. */
const PANEL_ORDER_AFTER = [
  "_contentSection",
  "heading",
  "headingSize",
  "description",
  "textSize",
  "colorScheme",
  "padding",
] as const;

type FieldCanon = {
  type: string | null;
  label: string;
  visibility: "panel" | "subpanel" | "off";
};
type BlockCanon = { label: string; fields: Record<string, FieldCanon> };

type PathsRow = {
  theme: string;
  paths: { hot: string | null; preview: string | null; live: string | null };
  empty: { blank: string; absent: string };
  sizes: Record<"small" | "medium" | "large", string | null>;
  sizesLive: Record<"small" | "medium" | "large", string | null>;
};

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
 * Разметка, а не подстрока. Маркер, доехавший ТЕКСТОМ
 * (`&lt;strong&gt;CFTEXT01Z`), — это жалоба тестера «в секции печатаются теги»,
 * и зачётом она идти не должна. Нужен `<em>CFTEXT01Z</em>` внутри `<strong>`:
 * ровно то, что отдают inlineFormat портов и sanitizeInline theme-base.
 */
function classify(html: string | null): string {
  if (html === null) return "нет страницы (композитор не собрал)";
  const rawShapes = [
    `<strong><em>${MARKER}</em></strong>`,
    `<em><strong>${MARKER}</strong></em>`,
    `<em>${MARKER}</em>`,
    `<strong>${MARKER}</strong>`,
  ];
  // Экранированный вид = теги видны на странице текстом.
  const escaped = html.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  if (rawShapes.some((s) => escaped.includes(s) && !html.includes(s))) {
    return "raw (теги видны текстом)";
  }
  const re = new RegExp(
    `<strong[^>]*>\\s*<em[^>]*>\\s*${MARKER}\\s*</em>\\s*</strong>`,
    "i",
  );
  if (re.test(html)) return "ok";
  if (html.includes(MARKER)) return "plain (начертание потеряно)";
  return "absent (НЕ ДОЕХАЛО)";
}

const panel: Record<string, Record<string, BlockCanon>> = {};
const paths: Record<string, PathsRow> = {};

beforeAll(() => {
  if (!built) return;
  const raw = execFileSync("node", [PANEL_DUMP], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
  Object.assign(panel, JSON.parse(raw).themes);
  for (const theme of THEMES) {
    const out = execFileSync("node", [PATHS_COLLECTOR, theme], {
      cwd: SITES_ROOT,
      encoding: "utf-8",
      maxBuffer: 256 * 1024 * 1024,
    });
    paths[theme] = JSON.parse(out) as PathsRow;
  }
}, 600_000);

describe("«Контактная форма» — поле «Текст» в панели", () => {
  it("секции и конфиг собраны (pnpm build && build:blocks && build:theme-sections:all)", () => {
    expect(built).toBe(true);
  });

  it("замер поднялся по всем пяти темам", () => {
    if (!built) return;
    expect(Object.keys(paths).sort()).toEqual([...THEMES].sort());
    for (const theme of THEMES) {
      expect(panel[theme]?.[BLOCK]).toBeDefined();
    }
  });

  it.each(THEMES)("%s: поле нарисовано НАШИМ контролом", (theme: Theme) => {
    if (!built) return;
    const f = panel[theme]?.[BLOCK]?.fields?.[FIELD];
    expect(f).toBeDefined();
    // Голое `text`/`textarea` кнопок «Ж»/«К» не имеет — это и есть «не наш».
    expect({ type: f.type, label: f.label, visibility: f.visibility }).toEqual({
      type: WANTED.type,
      label: WANTED.label,
      visibility: "panel",
    });
  });

  it.each(THEMES)(
    "%s: контрол заказан многострочным и с нашим плейсхолдером",
    (theme: Theme) => {
      if (!built) return;
      // panel-canon.mjs пишет только type/label/visibility, поэтому сюда
      // смотрим в САМ рабочий конфиг темы — тот, что уходит конструктору.
      const raw = execFileSync(
        "node",
        [
          "-e",
          `const m=require('./dist/src/controllers/theme-puck-config.controller.js');` +
            `new m.ThemePuckConfigController().getPuckConfig(${JSON.stringify(theme)})` +
            `.then(c=>process.stdout.write(JSON.stringify(c.components.${BLOCK}.fields.${FIELD})));`,
        ],
        { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
      );
      const f = JSON.parse(raw) as Record<string, unknown>;
      expect(f.fieldType).toBe(WANTED.fieldType);
      expect(f.placeholder).toBe(WANTED.placeholder);
    },
  );

  it.each(THEMES)(
    "%s: поле стоит в «Содержании» сразу за «Размером заголовка»",
    (theme: Theme) => {
      if (!built) return;
      const fields = panel[theme][BLOCK].fields;
      const visible = Object.keys(fields).filter(
        (k) => fields[k].visibility !== "off",
      );
      expect(visible).toEqual([...PANEL_ORDER_AFTER]);
    },
  );

  it.each(THEMES)(
    "%s: добавлено РОВНО одно поле, состав не расширен",
    (theme: Theme) => {
      if (!built) return;
      const now = Object.keys(panel[theme][BLOCK].fields).sort();
      // `description` был и остался — у него поменялась только ВИДИМОСТЬ.
      // Сверх него прибавилось ровно одно имя — `textSize` (просьба 2026-09-16).
      expect(now).toEqual([...FIELDS_AFTER].sort());
      const visibleCount = Object.values(panel[theme][BLOCK].fields).filter(
        (f) => f.visibility !== "off",
      ).length;
      // Было 5 контролов (+ заголовок раздела), после «Текста» 6, после
      // «Размера текста» 7.
      expect(visibleCount).toBe(7);
      expect(panel[theme][BLOCK].label).toBe("Контактная форма");
    },
  );
});

describe("«Контактная форма» — текст доезжает до рендера", () => {
  it.each(THEMES)(
    "%s: путь 1 — точечный hot-render блока (POST /preview/block)",
    (theme: Theme) => {
      if (!built) return;
      expect(classify(paths[theme].paths.hot)).toBe("ok");
    },
  );

  it.each(THEMES)(
    "%s: путь 2 — страница превью конструктора (composeV2Page, /__theme)",
    (theme: Theme) => {
      if (!built) return;
      expect(classify(paths[theme].paths.preview)).toBe("ok");
    },
  );

  it.each(THEMES)(
    "%s: путь 3 — собранная витрина (composeV2Page, корневые URL)",
    (theme: Theme) => {
      if (!built) return;
      expect(classify(paths[theme].paths.live)).toBe("ok");
    },
  );

  it.each(THEMES)(
    "%s: пустой «Текст» ведёт себя как отсутствующий (нет пустого абзаца)",
    (theme: Theme) => {
      if (!built) return;
      const { blank, absent } = paths[theme].empty;
      expect(blank).toBe(absent);
    },
  );
});

/**
 * «Размер текста» — просьба владельца 2026-09-16. Панель, которая показывает
 * список, а размер до витрины не доезжает, — тот же класс бага, ради которого
 * написан коллектор путей: мерчант выбирает «Большой», сохраняет, на сайте
 * ничего не меняется.
 *
 * Сравниваем разметку целиком: у каждой темы своя лестница кеглей (satin
 * 14/16/19, bloom 14/16/20 и т.д.), поэтому сторожится не конкретный класс
 * темы, а ФАКТ различия — три выбора дают три разных абзаца, и одинаково на
 * точечном рендере и на собранной витрине.
 */
describe("«Контактная форма» — «Размер текста» доезжает до рендера", () => {
  /**
   * «След размера» — то, чем тема отличает один выбор от другого. У четырёх тем
   * это класс самого абзаца; у rose подзаголовок рисует общий компонент
   * RoseSectionHeading важной утилитой `!text-[16px]`, поэтому кегль уезжает
   * CSS-переменной `--contacts-text-size` на секции, а абзац остаётся прежним.
   * Сравнивать только абзац значило бы объявить работающую тему сломанной.
   */
  const sizePrintOf = (html: string | null): string => {
    const paragraph = html?.match(/<p[^>]*>[\s\S]*?<\/p>/)?.[0] ?? "";
    const cssVar = html?.match(/--[a-z-]*text-size:\s*[^;"']+/)?.[0] ?? "";
    return paragraph + "|" + cssVar;
  };
  const paragraphOf = (html: string | null): string => sizePrintOf(html);

  it.each(THEMES)("%s: три размера дают три разных абзаца (hot-render)", (theme: Theme) => {
    if (!built) return;
    const { small, medium, large } = paths[theme].sizes;
    const got = [small, medium, large].map(paragraphOf);
    expect(got.every((p) => p.length > 0)).toBe(true);
    expect(new Set(got).size).toBe(3);
  });

  it.each(THEMES)("%s: то же на собранной витрине", (theme: Theme) => {
    if (!built) return;
    const { small, medium, large } = paths[theme].sizesLive;
    const got = [small, medium, large].map(paragraphOf);
    expect(got.every((p) => p.length > 0)).toBe(true);
    expect(new Set(got).size).toBe(3);
  });

  it.each(THEMES)("%s: без выбора размер равен одной из ступеней, а не пуст", (theme: Theme) => {
    if (!built) return;
    const withoutSize = paragraphOf(paths[theme].paths.hot);
    const steps = [
      paths[theme].sizes.small,
      paths[theme].sizes.medium,
      paths[theme].sizes.large,
    ].map(paragraphOf);
    expect(withoutSize.length).toBeGreaterThan(0);
    // Дефолт обязан совпадать с одной из ступеней: иначе у секций, где мерчант
    // размер не выбирал, вид поехал бы от самой правки.
    expect(steps).toContain(withoutSize);
  });
});
