/**
 * Перетаскивание параметров секций «Изображение» (Hero), «Основной текст»
 * (MainText) и «Подписка на рассылку» (Newsletter) — владелец 25.09:
 * «Изображение, Основной текст, Подписка на рассылку не работает drag and
 * drop в параметрах».
 *
 * Конструктор показывает ручки перетаскивания параметров, только если
 * puckConfig секции объявляет скрытое поле `fieldOrder` (constructor
 * src/lib/utils/arrayField.ts → supportsNamedOrder), и пишет порядок в
 * `props.fieldOrder`. До 25.09 так было устроено одно «Изображение с
 * текстом»; у трёх секций поля не было — ручек не было ни в одной теме.
 *
 * Сторожим обе половины контракта на всех пяти темах:
 *   1) отдаваемый конструктору puck-config (тот же контроллер, что у
 *      GET /api/themes/:id/puck-config) объявляет `fieldOrder` у каждой
 *      секции из реестра SECTION_FIELDS;
 *   2) порт темы (рендер скомпилированного модуля — как витрина и превью)
 *      рисует параметры в порядке `fieldOrder`, а «глаз» прячет поле
 *      независимо от порядка.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import {
  fieldRuns,
  orderFields,
  SECTION_FIELDS,
  sectionFieldOrder,
} from "../../../packages/theme-base/runtime/field-order";
import { renderSections } from "../../../scripts/qa/lib/render";

const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
const base = { colorScheme: "1", padding: { top: 40, bottom: 40 } };

type Case = {
  name: string;
  block: "Hero" | "MainText" | "Newsletter";
  props: Record<string, unknown>;
  /** Параметр панели → значение `data-puck-subsection-field` его узла. */
  marker: Record<string, string>;
};

const HERO_MARKER = {
  heading: "heading",
  text: "text",
  buttons: "primaryButton",
};
const NEWSLETTER_MARKER = { heading: "heading", buttonText: "placeholder" };

const CASES: Case[] = [
  {
    name: "«Изображение» с фото",
    block: "Hero",
    marker: HERO_MARKER,
    props: {
      ...base,
      backgroundImages: { url1: "/MK-FO-HERO.png" },
      heading: { text: "MK_FO_HEAD" },
      text: { content: "MK_FO_TEXT" },
      primaryButton: { text: "MK_FO_BTN", link: { href: "/catalog" } },
    },
  },
  {
    name: "«Изображение» пустое (заглушка)",
    block: "Hero",
    marker: HERO_MARKER,
    props: {
      ...base,
      heading: { text: "" },
      text: { content: "" },
      primaryButton: { text: "" },
    },
  },
  {
    name: "«Основной текст»",
    block: "MainText",
    marker: { heading: "heading", text: "text", button: "button" },
    props: {
      ...base,
      heading: { text: "MK_FO_HEAD" },
      text: { content: "MK_FO_TEXT" },
      button: { text: "MK_FO_BTN", link: { href: "/catalog" } },
      cta: { enabled: "true" },
    },
  },
  {
    name: "«Подписка на рассылку» (форма столбиком)",
    block: "Newsletter",
    marker: NEWSLETTER_MARKER,
    props: {
      ...base,
      heading: "MK_FO_HEAD",
      placeholder: "Email",
      buttonText: "MK_FO_BTN",
      formLayout: "stacked",
    },
  },
  {
    name: "«Подписка на рассылку» (кнопка в поле)",
    block: "Newsletter",
    marker: NEWSLETTER_MARKER,
    props: {
      ...base,
      heading: "MK_FO_HEAD",
      placeholder: "Email",
      buttonText: "MK_FO_BTN",
      formLayout: "inline-submit",
    },
  },
];

function render(
  theme: string,
  c: Case,
  extra: Record<string, unknown>,
): string {
  const [row] = renderSections(theme, [
    { block: c.block, props: { ...c.props, ...extra } },
  ]);
  if (row.error) throw new Error(`${theme} ${c.block}: ${row.error}`);
  return row.html ?? "";
}

/** Параметры в порядке их узлов в разметке; спрятанных «глазом» нет. */
function drawnOrder(html: string, marker: Record<string, string>): string[] {
  return Object.entries(marker)
    .map(([field, attr]) => ({
      field,
      at: html.indexOf(`data-puck-subsection-field="${attr}"`),
    }))
    .filter(({ at }) => at > -1)
    .sort((a, b) => a.at - b.at)
    .map(({ field }) => field);
}

/** Все перестановки реестра, включая исходную. */
function permutations<T>(list: readonly T[]): T[][] {
  if (list.length <= 1) return [[...list]];
  return list.flatMap((x, i) =>
    permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [
      x,
      ...rest,
    ]),
  );
}

describe("помощники порядка (packages/theme-base/runtime/field-order.ts)", () => {
  it("реестр секций — как NAMED_SUBSECTIONS конструктора", () => {
    expect(SECTION_FIELDS).toEqual({
      ImageWithText: ["heading", "text", "button"],
      Hero: ["heading", "text", "buttons"],
      MainText: ["heading", "text", "button"],
      Newsletter: ["heading", "buttonText"],
      Product: [
        "text",
        "title",
        "price",
        "variants",
        "quantity",
        "buttons",
        "description",
        "share",
      ],
    });
  });

  it("нет fieldOrder / не массив → реестр", () => {
    expect(sectionFieldOrder("Hero", {})).toEqual([
      "heading",
      "text",
      "buttons",
    ]);
    expect(sectionFieldOrder("Newsletter", { fieldOrder: "x" })).toEqual([
      "heading",
      "buttonText",
    ]);
  });

  it("чужие имена и дубли отбрасываются, недостающие — следом", () => {
    expect(
      orderFields(
        { fieldOrder: ["buttons", "image", "buttons"] },
        SECTION_FIELDS.Hero,
      ),
    ).toEqual(["buttons", "heading", "text"]);
  });

  it("отрезки: соседние заголовок и текст — в одной обёртке, кнопка отдельно", () => {
    const together = ["heading", "text"] as const;
    expect(fieldRuns(["heading", "text", "button"], together)).toEqual([
      { grouped: true, fields: ["heading", "text"] },
      { grouped: false, fields: ["button"] },
    ]);
    expect(fieldRuns(["heading", "button", "text"], together)).toEqual([
      { grouped: true, fields: ["heading"] },
      { grouped: false, fields: ["button"] },
      { grouped: true, fields: ["text"] },
    ]);
  });
});

describe("puck-config объявляет fieldOrder — без него конструктор не даёт ручек", () => {
  // Тот же скомпилированный контроллер, что отдаёт GET /api/themes/:id/puck-config;
  // грузит ESM-модули блоков, поэтому — дочерним процессом (как panel-canon.spec).
  const dump = JSON.parse(
    execFileSync("node", [resolve(__dirname, "panel-canon.mjs")], {
      cwd: resolve(__dirname, "../../.."),
      encoding: "utf-8",
      maxBuffer: 256 * 1024 * 1024,
    }),
  ).themes as Record<
    string,
    Record<string, { fields: Record<string, unknown> }>
  >;

  it.each(THEMES)("%s", (theme) => {
    const missing = Object.keys(SECTION_FIELDS).filter(
      (block) =>
        dump[theme]?.[block] && !("fieldOrder" in dump[theme][block].fields),
    );
    expect(missing).toEqual([]);
  });
});

describe.each(THEMES)("порядок параметров на витрине, тема %s", (theme) => {
  describe.each(CASES)("$name", (c) => {
    const registry = SECTION_FIELDS[c.block] as readonly string[];

    it.each(permutations(registry).map((order) => [order.join(" → "), order]))(
      "fieldOrder %s",
      (_label, order) => {
        expect(
          drawnOrder(render(theme, c, { fieldOrder: order }), c.marker),
        ).toEqual(order);
      },
    );

    it("«глаз» прячет заголовок при переставленном порядке", () => {
      const order = [...registry].reverse();
      const html = render(theme, c, {
        fieldOrder: order,
        hiddenFields: ["heading"],
      });
      expect(drawnOrder(html, c.marker)).toEqual(
        order.filter((f) => f !== "heading"),
      );
    });
  });
});
