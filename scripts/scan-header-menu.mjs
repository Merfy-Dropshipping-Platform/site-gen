#!/usr/bin/env node
/**
 * Сканер шапки и меню: рендерит секцию «Шапка» во всех темах и типах меню и
 * проверяет ВИДИМЫЕ инварианты — то, на что жалуется тестировщик, а не то, как
 * это устроено внутри.
 *
 * ЗАЧЕМ. Волна 21.09 закрыла пункты 24-26 документа владельца, и на каждый был
 * свой гард. Все три остались зелёными, а тестировщик вернул пункты 28 и 29:
 *   - у пункта с вложенностью оказались ДВЕ стрелки (родная у flux + добавленная);
 *   - нажатие на сам пункт уводило на страницу и закрывало меню;
 *   - в открытой панели логотип рисовался второй раз, кнопки закрытия не было.
 * Ни один гард этого не ловил, потому что каждый пинил СВОЮ правку («класс схемы
 * на корне», «кнопка раскрытия есть»), а не то, что видит человек. Сканер
 * смотрит на результат: сколько стрелок в строке, чем строка является, что
 * лежит в шапке панели.
 *
 * Запуск:
 *   node scripts/scan-header-menu.mjs            — таблица + код возврата
 *   node scripts/scan-header-menu.mjs --json     — машинный вывод для гарда
 *
 * Код возврата 1, если есть хоть одно нарушение.
 */
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RENDERER = resolve(ROOT, "src/themes/__tests__/render-theme-sections.mjs");

export const THEMES = ["rose", "bloom", "flux", "satin", "vanilla"];
export const MENU_TYPES = ["dropdown", "mega-menu", "sidebar"];

const NAV = [
  {
    label: "Каталог",
    href: "/catalog",
    submenu: [
      { label: "Наушники", href: "/catalog", submenu: [{ label: "TWS", href: "/catalog" }] },
      { label: "Колонки", href: "/catalog" },
    ],
  },
  { label: "О нас", href: "/about" },
];

function renderHeader(theme, menuType) {
  const props = {
    id: "Header-1",
    colorScheme: "scheme-1",
    menuColorScheme: "scheme-3",
    menuType,
    logoPosition: "center-left",
    siteTitle: "МАГАЗИН",
    navigationLinks: NAV,
    links: NAV,
  };
  const out = execFileSync(
    "node",
    [RENDERER, theme, JSON.stringify([{ block: "Header", props, live: true }])],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const [res] = JSON.parse(out);
  if (res.error) throw new Error(`${theme}/${menuType}: ${res.error}`);
  return res.html ?? "";
}

/** Корень шторки как узел разметки. */
function drawerNode(root, theme) {
  return root.querySelector(`#${theme}-burger`);
}

/** Строка пункта верхнего уровня, у которого есть вложенные. */
function parentRow(drawer) {
  if (!drawer) return null;
  return (
    drawer
      .querySelectorAll("[data-nav-sub-toggle]")
      .find((el) => (el.text || "").trim().startsWith("Каталог")) ?? null
  );
}

/**
 * ПРАВИЛА. Каждое — дословная формулировка того, что видит человек.
 * Добавляя новую жалобу, дописывай правило сюда, а не только гард на свою правку.
 */
const RULES = [
  {
    id: "одна-стрелка",
    заголовок: "у пункта с вложенностью ровно одна стрелка",
    menuTypes: ["sidebar"],
    check(_root, drawer) {
      const row = parentRow(drawer);
      if (!row) return "строка пункта с вложенностью не найдена";
      const glyphs = [...row.querySelectorAll("svg"), ...row.querySelectorAll("img")];
      return glyphs.length === 1 ? null : `стрелок ${glyphs.length}, а должна быть одна`;
    },
  },
  {
    id: "строка-раскрывает",
    заголовок: "нажатие на строку раскрывает уровень, а не уводит по ссылке",
    menuTypes: ["sidebar"],
    check(_root, drawer) {
      const row = parentRow(drawer);
      if (!row) return "строка пункта с вложенностью не найдена";
      if (row.tagName !== "BUTTON") return `строка — <${row.tagName.toLowerCase()}>, а не кнопка`;
      if (row.getAttribute("href")) return "у строки остался href — нажатие уведёт со страницы";
      return null;
    },
  },
  {
    id: "скрытый-уровень",
    заголовок: "вложенный уровень скрыт до нажатия",
    menuTypes: ["sidebar"],
    check(_root, drawer) {
      const row = parentRow(drawer);
      const group = row?.closest("[data-nav-group]");
      const panel = group?.querySelectorAll("[data-nav-sub]")[0];
      if (!panel) return "вложенный список не найден";
      return panel.hasAttribute("hidden") ? null : "вложенный список открыт сразу";
    },
  },
  {
    id: "крестик-в-панели",
    заголовок: "в открытой панели есть кнопка закрытия",
    menuTypes: ["sidebar"],
    check(_root, drawer) {
      if (!drawer) return "шторка не найдена";
      return drawer.querySelector("[data-burger-close]") ? null : "кнопки закрытия нет";
    },
  },
  {
    id: "логотип-не-дважды",
    заголовок: "логотип не дублируется внутри панели",
    menuTypes: ["sidebar"],
    check(_root, drawer) {
      if (!drawer) return "шторка не найдена";
      const logos = drawer.querySelectorAll('a[href="/"]');
      return logos.length === 0 ? null : `логотипов в панели: ${logos.length}`;
    },
  },
  {
    id: "в-шапке-панели-только-корзина",
    заголовок: "в шапке открытой панели крестик и корзина, без избранного",
    // Баг 4 документа «баги бокового меню» (22.09): «в шапке открытой панели
    // остаются обе иконки — избранное и корзина; ожидаемо — только корзина».
    menuTypes: ["sidebar"],
    check(_root, drawer) {
      const close = drawer?.querySelector("[data-burger-close]");
      if (!close) return "кнопки закрытия нет";
      // Строка шапки панели — ближайший предок крестика, внутри которого нет меню.
      let row = close.parentNode;
      while (row && row !== drawer && !row.querySelector("[data-cart-open], a[href='/cart']")) row = row.parentNode;
      if (!row || row === drawer) return "корзины в шапке панели нет";
      const hearts = row.querySelectorAll('a[href="/wishlist"]').length;
      return hearts === 0 ? null : `избранное в шапке панели: ${hearts}`;
    },
  },
  {
    id: "стрелка-только-у-вложенных",
    заголовок: "стрелка только у пункта с подпунктами",
    // Баг 6 документа «баги бокового меню»: стрелка обещает раскрытие, а обычный
    // пункт уводит на страницу и закрывает меню. У flux стрелка стояла у КАЖДОГО
    // пункта боковой панели.
    menuTypes: ["sidebar"],
    check(_root, drawer) {
      const nav = drawer?.querySelector("[data-nav-drawer]");
      if (!nav) return "меню в панели не найдено";
      const plain = nav.querySelectorAll("a[href]").filter((a) => (a.text || "").trim() === "О нас");
      if (!plain.length) return "обычный пункт «О нас» не найден";
      const glyphs = plain.reduce((n, a) => n + a.querySelectorAll("svg, img").length, 0);
      return glyphs === 0 ? null : `стрелок у пункта без вложенных: ${glyphs}`;
    },
  },
  {
    id: "бургер-в-крестик",
    заголовок: "иконка меню умеет превращаться в крестик",
    menuTypes: ["sidebar"],
    check(root) {
      const open = root.querySelectorAll('[data-icon="open"]').length;
      const close = root.querySelectorAll('[data-icon="close"]').length;
      if (!open || !close) return `состояний иконки: открыт ${open}, закрыт ${close}`;
      return null;
    },
  },
  {
    // Владелец 24.09: «не по ховеру, а по клику» (раньше здесь было правило
    // «раскрывается наведением» по пункту 25 прежнего документа).
    id: "нажатие-на-десктопе",
    заголовок: "меню шапки раскрывается нажатием, не наведением",
    menuTypes: ["dropdown", "mega-menu"],
    check(root, _drawer, html) {
      if (/group-hover\/(d1|d2|mega)/.test(html)) return "осталось раскрытие по наведению";
      if (!root.querySelector("[data-nav-menu] [data-nav-menu-toggle]")) return "у пункта с подменю нет кнопки раскрытия";
      if (!/group-data-\[open\]\/(d1|mega)/.test(html)) return "панель не показывается по data-open";
      return html.includes("data-nav-menu-toggle") && html.includes("__merfyNavSubmenuToggle")
        ? null
        : "в шапку не вставлен обработчик нажатия";
    },
  },
  {
    id: "вложенные-доезжают",
    заголовок: "вложенные пункты вообще доезжают до шапки",
    menuTypes: ["dropdown", "mega-menu", "sidebar"],
    check(_root, _drawer, html) {
      return html.includes("Наушники") ? null : "вложенные пункты потеряны";
    },
  },
  {
    id: "нет-мёртвых-ссылок",
    заголовок: "в меню нет зашитых страниц, которых нет в магазине",
    menuTypes: ["dropdown", "mega-menu", "sidebar"],
    check(_root, _drawer, html) {
      const dead = ["/register", "/sign-up", "/signup"].filter((h) => html.includes(`href="${h}"`));
      return dead.length ? `мёртвые ссылки: ${dead.join(", ")}` : null;
    },
  },
];

export function scan() {
  const findings = [];
  for (const theme of THEMES) {
    for (const menuType of MENU_TYPES) {
      const html = renderHeader(theme, menuType);
      const root = parse(html);
      const drawer = drawerNode(root, theme);
      for (const rule of RULES) {
        if (!rule.menuTypes.includes(menuType)) continue;
        const problem = rule.check(root, drawer, html);
        if (problem) findings.push({ theme, menuType, rule: rule.id, заголовок: rule.заголовок, problem });
      }
    }
  }
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const findings = scan();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    const cells = THEMES.length * MENU_TYPES.length;
    const checks = THEMES.length * MENU_TYPES.reduce(
      (acc, mt) => acc + RULES.filter((r) => r.menuTypes.includes(mt)).length,
      0,
    );
    console.log(`Сканер шапки и меню: ${THEMES.length} тем × ${MENU_TYPES.length} типов меню = ${cells} клеток, ${checks} проверок\n`);
    if (!findings.length) {
      console.log("нарушений нет");
    } else {
      for (const f of findings) {
        console.log(`✗ ${f.theme}/${f.menuType} — ${f.заголовок}: ${f.problem}`);
      }
      console.log(`\nвсего нарушений: ${findings.length}`);
    }
  }
  process.exit(findings.length ? 1 : 0);
}
