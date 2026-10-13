/**
 * Сторож формы покупки на странице товара (задача 5.1 спеки 120):
 *  — строка рантайма для темы пересобрана после последней правки модуля
 *    (файл extension-purchase.runtime.ts делает скрипт, руками не правят);
 *  — в строке нет zod и закрывающего тега скрипта;
 *  — Product.astro подключает форму за флагом и не включает старую рядом;
 *  — в коде общего рантайма нет слов предметной области (решение Р8).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EXTENSION_PURCHASE_RUNTIME_SOURCE } from "../runtime/extension-purchase.runtime";

const PACKAGE_DIR = resolve(__dirname, "..");
const read = (relative: string): string =>
  readFileSync(resolve(PACKAGE_DIR, relative), "utf8");

const BUILD_SCRIPT = "scripts/build-purchase-runtime.mjs";
const GENERATED_FILE = "runtime/extension-purchase.runtime.ts";
/**
 * Предел размера строки, КБ: сторож ловит, что в строку попал zod или что-то
 * такого же веса. Без zod: 5.1 — 30 КБ, с загрузкой файлов (5.2) — 46 КБ.
 */
const MAX_SOURCE_KB = 60;

describe("строка рантайма для темы", () => {
  it("совпадает с тем, что даёт пересборка модуля", () => {
    const rebuilt = execFileSync(process.execPath, [BUILD_SCRIPT, "--print"], {
      cwd: PACKAGE_DIR,
      encoding: "utf8",
    });
    expect(rebuilt).toBe(read(GENERATED_FILE));
  });

  it("файл помечен «создано скриптом»", () => {
    expect(read(GENERATED_FILE)).toMatch(/создано скриптом/);
  });

  it("не тянет zod и не содержит закрывающего тега скрипта", () => {
    expect(EXTENSION_PURCHASE_RUNTIME_SOURCE).not.toMatch(/zod/i);
    expect(EXTENSION_PURCHASE_RUNTIME_SOURCE).not.toMatch(/<\/script/i);
  });

  it(`весит не больше ${MAX_SOURCE_KB} КБ`, () => {
    expect(EXTENSION_PURCHASE_RUNTIME_SOURCE.length / 1024).toBeLessThan(
      MAX_SOURCE_KB,
    );
  });

  it("выставляет window.__merfyPurchase.mount", () => {
    expect(EXTENSION_PURCHASE_RUNTIME_SOURCE).toContain("__merfyPurchase");
  });
});

describe("Product.astro подключает форму покупки", () => {
  const product = read("blocks/Product/Product.astro");

  it("за своим флагом секции, со строкой рантайма и стилями", () => {
    expect(product).toContain("extensionPurchaseEnabled");
    expect(product).toContain("EXTENSION_PURCHASE_RUNTIME_SOURCE");
    expect(product).toContain("EXTENSION_PURCHASE_STYLES");
  });

  it("контейнер скрыт до монтирования, слот примечания у цены есть", () => {
    expect(product).toContain('class="xp"');
    expect(product).toContain("data-extension-purchase");
    expect(product).toContain("data-extension-purchase-note");
  });

  it("корень секции — через __merfyRoot (Spec 102), как у остальных островов", () => {
    expect(product).toContain("__merfyPurchase.mount");
    expect(product).toMatch(
      /window\.__merfyRoot\(blockId\)[\s\S]*__merfyPurchase\.mount/,
    );
  });

  it("старый остров не включается, когда включена новая форма", () => {
    expect(product).toContain("legacyFormEnabled");
    expect(product).toMatch(
      /legacyFormEnabled\s*=\s*requestsEnabled === true && extensionPurchaseEnabled !== true/,
    );
  });

  it("действия товара получают метку и при новом флаге", () => {
    expect(product).toMatch(
      /data-product-actions=\{[^}]*extensionPurchaseEnabled/,
    );
  });

  it("переключатель количества получает метку только при новом флаге — форма прячет его вместе с кнопками", () => {
    expect(product).toMatch(
      /data-puck-subsection-field="quantity"\s+data-product-quantity=\{extensionPurchaseEnabled \? 'true' : undefined\}/,
    );
  });
});

describe("слова предметной области в общем рантайме (решение Р8)", () => {
  /**
   * Не проверяем extension-purchase.runtime.ts: в него попадает копия пакета форм, где тексты
   * проверки PM и имя лимита написаны как есть. Исходники модуля и тесты — проверяем.
   */
  const FILES = [
    "runtime/extension-purchase.ts",
    "runtime/extension-purchase.styles.ts",
    BUILD_SCRIPT,
    "__tests__/extension-purchase.test.ts",
    "__tests__/extension-purchase.dom.test.ts",
    "runtime/extension-upload.ts",
    "runtime/extension-purchase-files.ts",
    "__tests__/extension-purchase-files.test.ts",
    "__tests__/extension-purchase-files.dom.test.ts",
  ];
  /**
   * Те же слова, что в чек-листе RULES §8: «заявк», `request-`/`requests_`/`request:`,
   * `requestId`, `requestForm`. Имя лимита пакета форм `perRequestGb` — не слово
   * предметной области: файлы считаются на одну отправку формы.
   */
  const FORBIDDEN = new RegExp(
    ["за", "явк|\\brequests?[-_:]|requestid|requestform"].join(""),
    "i",
  );

  it.each(FILES)("%s без слов предметной области", (file) => {
    expect(read(file)).not.toMatch(FORBIDDEN);
  });
});
