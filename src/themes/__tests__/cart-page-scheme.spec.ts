import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Секции СТРАНИЦЫ КОРЗИНЫ («Корзина» = CartBody, «Промежуточный итог» =
 * CartSummary) обязаны ехать за цветовой схемой во всех темах.
 *
 * Жалоба владельца 15.09 (дословно): «Баг секция Корзина в теме Bloom — Не
 * применяется цветовая схема», и то же про Satin.
 *
 * Замер «до» (реальный браузер, скрипт scripts/qa/measure-cart-scheme.mjs,
 * две схемы магазина: красная #D14D4D и светлая #F5F0EB, 18 мишеней на тему):
 *   • bloom  — 13 мишеней из 18 НЕПОДВИЖНЫ (фон 255,255,255 при обеих схемах,
 *              заголовок/название/цена/«Итого»/сумма 0,0,0, кнопки 0,0,0);
 *   • satin  — те же 13;
 *   • vanilla — 17 из 18 (фон 255,255,255, весь текст 10,10,10);
 *   • flux   — 16 из 18 на момент замера; фон корня починен веткой flux-product
 *              (main fc58e01b), литералы ВНУТРИ секций сняты веткой
 *              fix/b17-flux-cart-literals — кнопки, значок скидки, счётчик и
 *              тексты переведены на токены схемы (пара --color-button-*,
 *              --color-text, акцент темы для значка скидки);
 *   • rose   — эталон, едет полностью.
 *
 * Причины оказались РАЗНЫЕ, поэтому сторожей два:
 *   1) bloom/satin/flux — литералы (`bg-white`, `text-[#000000]`, `text-white`)
 *      прямо в разметке порта: токен схемы до них не достаёт;
 *   2) vanilla — разметка уже написана через переменные, но на момент замера
 *      ни одна утилита Tailwind из её портов не попадала в
 *      dist/theme-css/vanilla.css: не хватало @source на собственные
 *      ../components/**. Красит правило в её global.css.
 *
 *      УСТАРЕЛО НА 2026-09-15: строку вернули в main коммитом 859425be,
 *      теперь она есть у всех пяти тем. Замер после: бандл vanilla вырос со
 *      137 748 байт / 1 140 классов до 181 160 / 1 591 (+451 утилита, ни одной
 *      потерянной). Не чините «отсутствие @source» по этому абзацу — его больше
 *      нет; сам механизм теперь сторожит отдельный, общий для пяти тем
 *      `theme-port-utilities.spec.ts` (pnpm test:port-utilities).
 *
 * Сторож держит ОБА механизма разом: и запрет литералов, и наличие ремапа у
 * vanilla. Иначе починка расползётся обратно по пяти копиям портов.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
const SECTIONS = ["CartBody", "CartSummary"] as const;

/** Литералы, которые остаются законными (совпадают с эталоном rose). */
const ALLOWED = [
  {
    // size-20 (rose) либо size-[207px] (flux) — важно, что это квадратная
    // обрезанная плашка превью, а не произвольный серый фон.
    line: /size-(?:\d+|\[[^\]]+\]) shrink-0 overflow-hidden[^"]*bg-\[#F5F5F5\]/,
    why: "плейсхолдер превью товара — серая плашка под картинкой, как в rose",
  },
  {
    line: /var\(--vanilla-button-text, #ffffff\)/,
    why: "фолбэк переменной: схема подставляет --color-button-text, литерал — только запасной",
  },
  {
    line: /hover:bg-\[#F5F5F5\]/,
    why: "состояние hover, не постоянная краска",
  },
  {
    line: /border-\[#E5E5E5\]/,
    why: "рамка счётчика количества в rose — эталон её не токенизирует (общий хвост всех тем)",
  },
];

function sectionSource(theme: string, section: string): string {
  return readFileSync(
    resolve(SITES_ROOT, "themes", theme, "src/components/sections", `${section}.astro`),
    "utf-8",
  );
}

/** Строки файла, красящие ПОСТОЯННЫМ литералом (не hover/не фолбэк). */
function literalPaintLines(src: string): string[] {
  const bad: string[] = [];
  src.split("\n").forEach((line, i) => {
    if (ALLOWED.some((a) => a.line.test(line))) return;
    const hits = [
      /(?<!hover:)(?<!group-hover:)\btext-\[#[0-9A-Fa-f]{3,8}\]/,
      /(?<!hover:)(?<!group-hover:)\bbg-\[#[0-9A-Fa-f]{3,8}\]/,
      /(?<!hover:)\b(?:text|bg)-(?:white|black)\b/,
      /(?<!hover:)\bborder-\[#[0-9A-Fa-f]{3,8}\]/,
      /(?<!-)\bcolor:\s*#[0-9A-Fa-f]{3,8}/,
      /(?<!-)\bbackground(?:-color)?:\s*#[0-9A-Fa-f]{3,8}/,
    ];
    if (hits.some((re) => re.test(line))) bad.push(`${i + 1}: ${line.trim()}`);
  });
  return bad;
}

/** Корневой <section …> секции — из него читаем класс фона. */
function rootTag(src: string): string {
  const m = /<section[\s\S]*?>/.exec(src);
  return m ? m[0] : "";
}

describe("секции корзины едут за цветовой схемой", () => {
  describe.each(THEMES)("%s", (theme) => {
    it.each(SECTIONS)("%s — ни одной постоянной краски литералом", (section) => {
      const bad = literalPaintLines(sectionSource(theme, section));
      expect(bad).toEqual([]);
    });
  });

  describe.each(THEMES)("%s", (theme) => {
    it.each(SECTIONS)("%s — фон корня задан токеном схемы", (section) => {
      const tag = rootTag(sectionSource(theme, section));
      expect(tag).toMatch(/bg-\[rgb\(var\(--color-bg/);
      expect(tag).not.toMatch(/\bbg-white\b/);
    });
  });

  // vanilla: утилиты из её портов мертвы (нет @source) — красит правило темы.
  describe("vanilla — ремап --vanilla-* на секциях корзины", () => {
    const css = readFileSync(
      resolve(SITES_ROOT, "themes/vanilla/src/styles/global.css"),
      "utf-8",
    );
    const rule =
      /\[data-block="cart-body"\]\[class\*="color-scheme-"\][\s\S]{0,400}?\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";

    it.each([
      ["--vanilla-dark", "--color-heading"],
      ["--vanilla-muted", "--color-muted"],
      ["--vanilla-header-bg", "--color-button-bg"],
      ["--vanilla-line", "--color-muted"],
      ["--vanilla-button-text", "--color-button-text"],
    ])("%s берёт значение из %s", (alias, token) => {
      expect(rule).toContain(alias);
      const decl = new RegExp(`${alias}:[^;]*${token}`).exec(rule);
      expect(decl).not.toBeNull();
    });

    it("фон и цвет текста секции — из токенов схемы", () => {
      expect(rule).toMatch(/background-color:\s*rgb\(var\(--color-bg\)\)/);
      expect(rule).toMatch(/color:\s*rgb\(var\(--color-text\)\)/);
    });

    it("сводка корзины покрыта тем же правилом", () => {
      expect(css).toContain('[data-block="cart-summary"][class*="color-scheme-"]');
    });
  });

  // Баг владельца 16.09 (дословно): «Баг секция Корзина в теме Bloom — Не
  // применяется цветовая схема: Заголовок, цены, плашка количества». Заголовок
  // и цены уже покрыты проверками выше (literalPaintLines + мишени
  // measure-cart-scheme.mjs); «плашка количества» — счётчик и кнопки ±
  // строки товара — не мерилась вообще ни одним сторожем (замер 15.09,
  // 17 мишеней, не включал её). bloom красил соседние элементы строки
  // (название, цена, «Удалить») токеном --color-text/--color-muted, а
  // <span>{line.quantity}</span> и data-cart-dec/-inc — нет, полагаясь на
  // унаследованный цвет. Эталон — rose: там все три мишени несут явный
  // text-[rgb(var(--color-text,0_0_0))]. Сторож держит ИСХОДНИК bloom.
  //
  // CartSection.astro — legacy-«комбо» версия страницы корзины (до раздела
  // на CartBody+CartSummary спекой 110), но она ОСТАЁТСЯ адресуемым типом
  // блока (компилируется в dist/theme-sections — см. манифест сборки) и
  // несла ТОЧНО ТАКОЙ ЖЕ пробел, поэтому проверяется тем же приёмом.
  describe.each(["CartBody", "CartSection"] as const)("bloom %s — плашка количества и кнопки ± едут за схемой", (section) => {
    const src = sectionSource("bloom", section);
    // Строка «<span class="…">${line.quantity}</span>» — без якоря по
    // содержимому регэксп поймает случайный соседний span, поэтому ищем
    // ИМЕННО тот, что держит `${line.quantity}`.
    const qtySpan = /<span class="([^"]*)">\$\{line\.quantity\}<\/span>/.exec(src)?.[1] ?? "";
    const decBtn = /<button type="button" data-cart-dec[^>]*class="([^"]*)"/.exec(src)?.[1] ?? "";
    const incBtn = /<button type="button" data-cart-inc[^>]*class="([^"]*)"/.exec(src)?.[1] ?? "";

    it("плашка количества найдена в исходнике", () => {
      expect(qtySpan).not.toBe("");
    });

    it.each([
      ["плашка количества (span)", () => qtySpan],
      ["кнопка «минус» (data-cart-dec)", () => decBtn],
      ["кнопка «плюс» (data-cart-inc)", () => incBtn],
    ])("%s несёт text-[rgb(var(--color-text", (_label, getCls) => {
      expect(getCls()).toMatch(/text-\[rgb\(var\(--color-text/);
    });
  });

});
