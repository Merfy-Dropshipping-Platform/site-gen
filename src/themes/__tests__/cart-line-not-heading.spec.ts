import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Жалоба владельца 19.09 (дословно): «цвет скидки должен быть как у текста, а
 * не браться из заголовка». Уточнение: «сатин блум роза — вот не работает».
 *
 * ЗАМЕР. По скриншоту владельца (схема: фон #26311c, заголовок #FA2121, текст
 * #44FF6D) карта пикселей превью дала: имя товара и цена со скидкой — красные
 * (то есть `--color-heading`), зачёркнутая старая цена — зелёная. Сами токены
 * при этом эмитятся верно во всех пяти темах (`buildTokensCss` печатает
 * heading 250 33 33, text 68 255 109), значит виновата разметка, а не схема.
 *
 * ПОЧЕМУ БАГ ДОЖИЛ. В дефолтных схемах всех пяти тем `--color-heading` РАВЕН
 * `--color-text` (единственное исключение — flux scheme-2). Поэтому подмена
 * невидима на любом стенде и вылезает только у мерчанта, который задал
 * заголовок и текст разными цветами.
 *
 * ЧТО СТОРОЖИМ. В строке товара корзины (имя, текущая цена, старая цена) цвет
 * берётся из ТЕКСТА схемы. Заголовочный токен там запрещён — включая алиас
 * `--vanilla-dark`, который объявлен как `rgb(var(--color-heading))` и на
 * который 16.09 ошибочно перевели старую цену vanilla, приняв его за текст.
 *
 * Заголовок самой секции («Корзина») под это правило НЕ попадает — он обязан
 * быть заголовочным. Сводка («Итого») тоже вне объёма: у flux она намеренно
 * заголовочная, владелец на неё не жаловался.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "vanilla", "flux"] as const;
/**
 * Три пути, где рисуется строка товара: страница корзины (CartBody), легаси-
 * алиас для немигрированных ревизий (CartSection) и дровер (`lib/cart.ts`).
 * Дровер добавлен 19.09: снимки секций показали вторую зачёркнутую цену,
 * которая осталась приглушённой после починки первых двух. У satin старая
 * цена живёт ТОЛЬКО здесь — на странице её нет вовсе.
 */
const FILES = [
  "components/sections/CartBody.astro",
  "components/sections/CartSection.astro",
  "lib/cart.ts",
] as const;

/** Алиасы, которые разворачиваются в --color-heading. */
const HEADING_TOKENS = /--color-heading|--vanilla-dark/;

type Target = { theme: string; file: string; src: string };

const targets: Target[] = [];
for (const theme of THEMES) {
  for (const file of FILES) {
    const path = resolve(SITES_ROOT, "themes", theme, "src", ...file.split("/"));
    if (!existsSync(path)) continue;
    targets.push({ theme, file, src: readFileSync(path, "utf-8") });
  }
}

/** Строки разметки, где печатается имя товара. */
const nameLines = (src: string): string[] =>
  src.split("\n").filter((l) => l.includes("${line.name}"));

/** Строки разметки, где печатается текущая цена позиции. */
const priceLines = (src: string): string[] =>
  src
    .split("\n")
    .filter(
      (l) =>
        l.includes("class=") &&
        (l.includes("${totalCurrent}") ||
          /\$\{formatCartPrice\(line\.price[^)]*\)\}/.test(l)),
    );

/** Строки разметки зачёркнутой старой цены. */
const oldPriceLines = (src: string): string[] =>
  src.split("\n").filter((l) => l.includes("line-through") && l.includes("class="));

describe("корзина: строка товара красится текстом схемы, а не заголовком", () => {
  it("мишени найдены во всех пяти темах", () => {
    expect(targets.length).toBe(15);
    for (const theme of THEMES) {
      expect(targets.some((t) => t.theme === theme)).toBe(true);
    }
  });

  it.each(targets.map((t) => [`${t.theme}/${t.file}`, t] as const))(
    "%s: имя товара не берёт заголовочный токен",
    (_label, t) => {
      const lines = nameLines(t.src);
      if (t.file === "lib/cart.ts") return; // дровер печатает имя иначе
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect(line).not.toMatch(HEADING_TOKENS);
    },
  );

  it.each(targets.map((t) => [`${t.theme}/${t.file}`, t] as const))(
    "%s: текущая цена не берёт заголовочный токен",
    (_label, t) => {
      const lines = priceLines(t.src);
      if (t.file === "lib/cart.ts") return; // дровер печатает цену иначе
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect(line).not.toMatch(HEADING_TOKENS);
    },
  );

  it.each(targets.map((t) => [`${t.theme}/${t.file}`, t] as const))(
    "%s: старая (зачёркнутая) цена красится --color-text",
    (_label, t) => {
      const lines = oldPriceLines(t.src);
      // satin старую цену на СТРАНИЦЕ не выводит вовсе (в дровере — выводит).
      if (lines.length === 0) {
        expect(t.theme).toBe("satin");
        expect(t.file).not.toBe("lib/cart.ts");
        return;
      }
      for (const line of lines) {
        expect(line).toMatch(/--color-text/);
        expect(line).not.toMatch(HEADING_TOKENS);
        expect(line).not.toMatch(/--color-muted/);
        expect(line).not.toMatch(/text-\[#[0-9A-Fa-f]{3,8}\]/);
      }
    },
  );
});

describe("саботаж: гард обязан ловить возврат заголовочного цвета", () => {
  it("имя товара цветом заголовка — красный", () => {
    const line = `<a class="text-[rgb(var(--color-heading,0_0_0))]">\${line.name}</a>`;
    expect(nameLines(line)[0]).toMatch(HEADING_TOKENS);
  });

  it("старая цена через алиас --vanilla-dark — красный", () => {
    const line = `<span class="text-[var(--vanilla-dark)] line-through">100 ₽</span>`;
    expect(oldPriceLines(line)[0]).toMatch(HEADING_TOKENS);
  });

  it("старая цена приглушённым серым — красный", () => {
    const line = `<span class="text-[rgb(var(--color-muted,153_153_153))] line-through">100 ₽</span>`;
    expect(oldPriceLines(line)[0]).not.toMatch(/--color-text/);
  });
});
