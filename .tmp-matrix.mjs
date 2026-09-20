import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { chromium } from "playwright";
const LINKS = [{ text: "Главная", href: "/" }, { text: "Наушники", href: "/catalog" }, { text: "Колонки", href: "/catalog" }];
const POSITIONS = ["top-left", "top-center", "center-left", "center-absolute"];
const MENUS = ["dropdown", "mega-menu", "sidebar"];
const THEMES = process.argv.slice(2);
function render(theme, logoPosition, menuType) {
  const out = execFileSync("node", ["src/themes/__tests__/render-theme-sections.mjs", theme,
    JSON.stringify([{ block: "Header", props: { id: "Header-1", colorScheme: "1", logoPosition, menuType, navigationLinks: LINKS, links: LINKS }, live: true }])],
    { encoding: "utf8", maxBuffer: 64e6 });
  const [r] = JSON.parse(out);
  if (r.error) throw new Error(String(r.error).slice(0, 120));
  return r.html;
}
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 400 } });
for (const theme of THEMES) {
  const CSS = readFileSync(`dist/theme-css/${theme}.css`, "utf8");
  console.log(`\n===== ${theme} (окно 1280, ожидаемый отступ справа ≈ отступу слева) =====`);
  for (const pos of POSITIONS) {
    const row = [];
    for (const menu of MENUS) {
      writeFileSync("/tmp/m.html", `<!doctype html><meta charset="utf-8"><style>${CSS}body{margin:0}</style>${render(theme, pos, menu)}`);
      await page.goto("file:///tmp/m.html", { waitUntil: "networkidle" });
      await page.waitForTimeout(160);
      const r = await page.evaluate(() => {
        const h = document.querySelector("header") || document.body.firstElementChild;
        const hr = h.getBoundingClientRect();
        const vis = e => e.offsetParent !== null && e.getBoundingClientRect().width > 0;
        const acts = [...h.querySelectorAll("a,button")].filter(e => vis(e) && /Поиск|Корзина|Аккаунт|Избранное|Меню/.test(e.getAttribute("aria-label")||""));
        if (!acts.length) return { right: null };
        const maxR = Math.max(...acts.map(e => e.getBoundingClientRect().right));
        const minL = Math.min(...[...h.querySelectorAll("a,nav,div")].filter(vis).map(e => e.getBoundingClientRect().left).filter(x => x > 0));
        return { right: Math.round(hr.right - maxR), left: Math.round(minL - hr.left) };
      });
      const ok = r.right !== null && Math.abs(r.right - r.left) <= 24;
      row.push(`${menu}:${r.right === null ? "?" : r.right}${ok ? "✓" : "✗"}`);
    }
    console.log(`  ${pos.padEnd(16)} ${row.join("   ")}`);
  }
}
await b.close();
