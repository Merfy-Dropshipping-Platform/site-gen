import { globSync, readFileSync } from "fs";
import path from "path";

/**
 * Инлайн-скрипты витрины (каталог, карточка товара) не могут импортировать модули и
 * раньше брали адрес шлюза как `__MERFY_API_BASE__ || "https://gateway.merfy.ru"`:
 * на dev-контуре (spec 116) витрина молча ходила в прод. Источник адреса — конфиг
 * страницы `window.__MERFY_CONFIG__.apiUrl`, который Header кладёт из PUBLIC_MERFY_API_URL
 * на сборке; литерал прода — только последний запасной вариант.
 */
const ROOT = path.resolve(__dirname, "../../..");
const PATTERNS = ["packages/theme-*/blocks/**/*.astro", "packages/theme-base/**/*.{astro,ts}", "themes/*/src/**/*.{astro,ts}"];
const skip = (f: string) => /(^|\/)(dist|\.astro|node_modules|__tests__)\//.test(f);
const FILES = PATTERNS.flatMap((p) => globSync(p, { cwd: ROOT })).filter((f) => !skip(f));

const DIRECT_PROD_FALLBACK = /__MERFY_API_BASE__\)\s*\|\|\s*"https:\/\/gateway\.merfy\.ru"/;
const CONFIG_LOOKUP = "window.__MERFY_CONFIG__ && window.__MERFY_CONFIG__.apiUrl";

describe("витрина: адрес API из конфига страницы, не из прод-литерала", () => {
  it("ни один инлайн-скрипт не падает с __MERFY_API_BASE__ сразу на прод-шлюз", () => {
    const offenders = FILES.filter((f) => DIRECT_PROD_FALLBACK.test(readFileSync(path.join(ROOT, f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("каждый скрипт с __MERFY_API_BASE__ и литералом шлюза читает __MERFY_CONFIG__.apiUrl", () => {
    const offenders = FILES.filter((f) => {
      const src = readFileSync(path.join(ROOT, f), "utf8");
      return src.includes("__MERFY_API_BASE__") && src.includes('"https://gateway.merfy.ru"') && !src.includes(CONFIG_LOOKUP) &&
        !src.includes("__MERFY_CONFIG__?.") && !src.includes("cfg.apiUrl") && !src.includes("cfg.apiBase");
    });
    expect(offenders).toEqual([]);
  });

  it("выражение из витрины на dev-конфиге даёт dev-шлюз, без конфига — прод", () => {
    const resolve = (win: { __MERFY_API_BASE__?: string; __MERFY_CONFIG__?: { apiUrl?: string } }) =>
      win.__MERFY_API_BASE__ ||
      (win.__MERFY_CONFIG__ && win.__MERFY_CONFIG__.apiUrl
        ? String(win.__MERFY_CONFIG__.apiUrl).replace(/\/+$/, "").replace(/\/api$/, "")
        : "") ||
      "https://gateway.merfy.ru";
    expect(resolve({ __MERFY_CONFIG__: { apiUrl: "https://gateway.dev.merfy.ru/api" } })).toBe("https://gateway.dev.merfy.ru");
    expect(resolve({ __MERFY_API_BASE__: "http://localhost:3110", __MERFY_CONFIG__: { apiUrl: "https://gateway.dev.merfy.ru/api" } })).toBe("http://localhost:3110");
    expect(resolve({})).toBe("https://gateway.merfy.ru");
  });
});
