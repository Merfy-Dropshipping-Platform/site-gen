import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

import { renderSections } from "../../../scripts/qa/lib/render";

/**
 * flux, секция «Изображение» ПУСТАЯ (только что добавлена, без своих фото и
 * текста — рисуется заглушка) слушает панель так же, как заполненная.
 *
 * Тестер 24.09: «Изображение по всем настройкам сломалась, не принимает
 * изменения». Заглушка была отдельной веткой с жёсткими классами (центр,
 * фиксированные кегли, постоянное затемнение 30 %), и Затемнение, Позиция,
 * Выравнивание, Размер заголовка, Размер текста и вторая кнопка до неё не
 * доходили — `settings-audit --empty` показывал 6 мёртвых полей у Hero.
 *
 * Сторожим: каждое поле меняет разметку пустой секции, раскладка — теми же
 * классами, что у заполненной, а без своего значения заглушка стоит так, как
 * показывает панель (blockDefaults темы: «По центру слева», затемнение 0;
 * выравнивание — «слева»).
 *
 * Требует сборки: pnpm build && pnpm build:theme-sections flux
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const PANEL_DEFAULTS = JSON.parse(
  readFileSync(resolve(SITES_ROOT, "packages/theme-flux/theme.json"), "utf8"),
).blockDefaults.Hero as Record<string, unknown>;

const КАТАЛОГ = { products: [], collections: [], publications: [] };
const БАЗА = { id: "Hero-1", colorScheme: "scheme-1" };
const МЕТКА_ПУСТОЙ = "Покажи и расскажи";
const РАЗМЕРЫ = ["small", "medium", "large"] as const;

/** Все рендеры — одним процессом: каждый вызов поднимает отдельный node. */
const ЗАДАНИЯ: Record<string, Record<string, unknown>> = {
  "пусто": БАЗА,
  "панель по умолчанию": { ...БАЗА, ...PANEL_DEFAULTS },
  "overlay 0": { ...БАЗА, overlay: 0 },
  "overlay 60": { ...БАЗА, overlay: 60 },
  "position top-right": { ...БАЗА, position: "top-right" },
  "position center": { ...БАЗА, position: "center" },
  "position bottom-left": { ...БАЗА, position: "bottom-left" },
  "alignment left": { ...БАЗА, alignment: "left" },
  "alignment center": { ...БАЗА, alignment: "center" },
  "alignment right": { ...БАЗА, alignment: "right" },
  "secondary": { ...БАЗА, secondaryButton: { text: "Вторая", link: "/about" } },
  ...Object.fromEntries(
    РАЗМЕРЫ.flatMap((s) => [
      [`heading.size ${s}`, { ...БАЗА, heading: { size: s } }],
      [`text.size ${s}`, { ...БАЗА, text: { size: s } }],
      [
        `заполненная ${s}`,
        { ...БАЗА, heading: { text: "Заголовок", size: s }, text: { content: "Текст", size: s } },
      ],
    ]),
  ),
};

let html: Record<string, string> = {};

beforeAll(() => {
  const names = Object.keys(ЗАДАНИЯ);
  const out = renderSections(
    "flux",
    names.map((n) => ({ block: "Hero", props: ЗАДАНИЯ[n], catalog: КАТАЛОГ })),
  );
  html = Object.fromEntries(names.map((n, i) => [n, out[i]?.html ?? ""]));
}, 120_000);

const пустой = (name: string) => !name.startsWith("заполненная");

/** h1 → колонка текста → колонка блока → внешний слой позиции. */
function слои(name: string) {
  const root = parse(html[name]);
  const h1 = root.querySelector("h1");
  if (!h1) throw new Error(`${name}: в разметке нет <h1>`);
  const текст = h1.parentNode as HTMLElement;
  const блок = текст.parentNode as HTMLElement;
  const позиция = блок.parentNode as HTMLElement;
  return { root, h1, p: root.querySelector("p"), текст, блок, позиция };
}

const классы = (el: HTMLElement | null | undefined) =>
  (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
const кегль = (el: HTMLElement | null | undefined) =>
  классы(el)
    .filter((c) => /^(md:|lg:)?text-\[(\d|length)/.test(c))
    .sort();
const затемнение = (name: string) =>
  parse(html[name])
    .querySelectorAll("div")
    .find((d) => классы(d).includes("bg-black") && /opacity:/.test(d.getAttribute("style") ?? ""));

describe("flux: пустая секция «Изображение» слушает панель", () => {
  it("все рендеры пустых вариантов — действительно заглушка", () => {
    const мимо = Object.keys(ЗАДАНИЯ).filter((n) => пустой(n) && !html[n].includes(МЕТКА_ПУСТОЙ));
    expect(мимо).toEqual([]);
  });

  it.each([
    ["Затемнение", "overlay 0", "overlay 60"],
    ["Позиция", "position top-right", "position bottom-left"],
    ["Выравнивание", "alignment left", "alignment right"],
    ["Размер заголовка", "heading.size small", "heading.size large"],
    ["Размер текста", "text.size small", "text.size large"],
    ["Вторая кнопка", "пусто", "secondary"],
  ])("%s меняет разметку", (_поле, a, b) => {
    expect(html[a].length).toBeGreaterThan(0);
    expect(html[a]).not.toEqual(html[b]);
  });

  describe("без своего значения — как показывает панель", () => {
    it("панель по умолчанию = рендер без пропсов", () => {
      expect(PANEL_DEFAULTS).toMatchObject({ position: "center-left", overlay: 0 });
      expect(html["панель по умолчанию"]).toEqual(html["пусто"]);
    });

    it("«По центру слева»: блок слева по середине высоты", () => {
      const { позиция } = слои("пусто");
      expect(классы(позиция)).toEqual(expect.arrayContaining(["items-start", "justify-center"]));
    });

    it("выравнивание «слева»: текст и кнопка у левого края блока", () => {
      const { текст, блок } = слои("пусто");
      expect(классы(блок)).toContain("items-start");
      expect(классы(текст)).toEqual(expect.arrayContaining(["items-start", "text-left"]));
      expect(html["пусто"]).toEqual(html["alignment left"]);
    });

    it("затемнение 0: слоя нет (и прежнего постоянного bg-black/30 тоже)", () => {
      expect(затемнение("пусто")).toBeUndefined();
      expect(html["пусто"]).not.toContain("bg-black/30");
      expect(html["пусто"]).toEqual(html["overlay 0"]);
    });

    it("размеры — «Большой», как у заполненной ветки без своего значения", () => {
      const { h1, p } = слои("пусто");
      const полная = слои("заполненная large");
      expect(кегль(h1)).toEqual(кегль(полная.h1));
      expect(кегль(p)).toEqual(кегль(полная.p));
    });

    it("второй кнопки нет", () => {
      expect(html["пусто"]).not.toContain('data-puck-subsection-field="secondaryButton"');
    });
  });

  it("Затемнение 60: тот же чёрный слой, что у заполненной ветки, с opacity 0.6", () => {
    const слой = затемнение("overlay 60");
    expect(слой).toBeDefined();
    expect(слой!.getAttribute("style")).toBe("opacity:0.6");
  });

  it.each([
    ["position top-right", "items-end", "justify-start"],
    ["position center", "items-center", "justify-center"],
    ["position bottom-left", "items-start", "justify-end"],
  ])("%s → %s %s", (name, h, v) => {
    expect(классы(слои(name).позиция)).toEqual(expect.arrayContaining([h, v]));
  });

  it.each([
    ["alignment center", "items-center", "text-center"],
    ["alignment right", "items-end", "text-right"],
  ])("%s → текст и кнопка: %s %s", (name, items, text) => {
    const { текст, блок } = слои(name);
    expect(классы(блок)).toContain(items);
    expect(классы(текст)).toEqual(expect.arrayContaining([items, text]));
  });

  it.each(РАЗМЕРЫ)("Размер заголовка/текста %s — те же ступени, что у заполненной", (s) => {
    const полная = слои(`заполненная ${s}`);
    expect(кегль(слои(`heading.size ${s}`).h1)).toEqual(кегль(полная.h1));
    expect(кегль(слои(`text.size ${s}`).p)).toEqual(кегль(полная.p));
  });

  it("вторая кнопка рисуется с заданным текстом, пара — равной ширины", () => {
    const root = parse(html["secondary"]);
    const вторая = root.querySelector('a[data-puck-subsection-field="secondaryButton"]');
    expect(вторая?.text.trim()).toBe("Вторая");
    expect(вторая?.getAttribute("href")).toBe("/about");
    const ряд = вторая!.parentNode as HTMLElement;
    expect(классы(ряд)).toContain("[grid-template-columns:1fr_1fr]");
    const кнопки = ряд.querySelectorAll("a");
    expect(кнопки).toHaveLength(2);
    for (const a of кнопки) expect(классы(a)).toContain("w-auto");
  });
});
