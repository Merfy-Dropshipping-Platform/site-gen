import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Перепроверка тестера (20.09): «Поиск в каталоге не фильтрует. Vanilla, Bloom,
 * Rose. ?q= игнорируется полностью, ввод в поле тоже. Плюс форма ведёт не в
 * каталог: Vanilla → /catalog/textile, Bloom → /skin-care (демо-страницы тем)».
 *
 * Сам каталог искать умеет — замер API: `q=ZZZNOTHING` даёт 0 товаров из 60.
 * Ломалась доставка запроса: форма поиска в шапке vanilla и bloom отправляла на
 * демо-страницу вёрстки (у верстальщиков поиск искал внутри своей категории), а
 * у настоящего магазина таких страниц нет — запрос уходил мимо каталога.
 *
 * Гард смотрит на ИТОГОВЫЙ адрес: имя переменной у тем разное
 * (`catalogSearchAction`, `categorySearchAction`), а цель должна быть одна.
 */
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "flux", "bloom", "satin", "vanilla"] as const;

function findFile(dir: string, name: string): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findFile(full, name);
      if (hit) return hit;
    } else if (entry.name === name) return full;
  }
  return null;
}

/** Куда реально отправляет форма поиска: литерал или значение переменной. */
function searchAction(theme: string): string[] {
  const file = findFile(resolve(SITES_ROOT, "themes", theme, "src"), "Header.astro");
  if (!file) throw new Error(`${theme}: Header.astro не найден`);
  const src = readFileSync(file, "utf8");
  const raw = [...src.matchAll(/<form[^>]*action=\{?"?([^\s>"}]+)/g)].map((m) => m[1]);
  return raw.map((value) => {
    if (value.startsWith("/")) return value;
    const decl = src.match(new RegExp(`const ${value}\\s*=\\s*"([^"]+)"`));
    return decl ? decl[1] : `<не разрешено: ${value}>`;
  });
}

describe("поиск из шапки уходит в каталог", () => {
  it.each(THEMES)("%s", (theme) => {
    const actions = searchAction(theme);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action).toBe("/catalog");
    }
  });
});
