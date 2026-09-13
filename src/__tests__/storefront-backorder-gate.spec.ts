/**
 * Страж контракта «Продавать когда закончился» (allowBackorder) на витрине.
 *
 * Регрессия e861cb47 (flux parity): из isActiveAvailable в theme-base Product.astro
 * пропало условие `v.allowBackorder === true`, и PDP вариантного товара с 0 стока
 * и включённым флагом показывал disabled «Нет в наличии», хотя gateway/storefront-data
 * отдают available:true. Вторая половина: products.json не нёс флаг на вариантах,
 * поэтому даже с условием статика блокировала покупку до live-рефреша.
 *
 * Тест читает исходники, а не рендерит: гейт живёт в inline-скрипте, снапшоты
 * секций его не покрывают.
 */
import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

describe("allowBackorder на витрине", () => {
  it("theme-base Product.astro: isActiveAvailable учитывает allowBackorder", () => {
    const src = read("packages/theme-base/blocks/Product/Product.astro");
    const start = src.indexOf("function isActiveAvailable()");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("}", src.indexOf("return", start)));
    expect(body).toContain("v.available !== false");
    expect(body).toContain("v.allowBackorder === true");
  });

  it("build.service: products.json эмитит allowBackorder на вариантах", () => {
    const src = read("src/generator/build.service.ts");
    const idx = src.indexOf("available: v.available !== false,");
    expect(idx).toBeGreaterThan(-1);
    const mapping = src.slice(idx, idx + 600);
    expect(mapping).toContain("allowBackorder: v.allowBackorder === true");
  });

  it("rose storefront-hydrate: productInStock учитывает allowBackorder", () => {
    const src = read("packages/theme-rose/blocks/Catalog/storefront-hydrate.ts");
    expect(src).toMatch(/allowBackorder\s*===\s*true/);
  });
});
