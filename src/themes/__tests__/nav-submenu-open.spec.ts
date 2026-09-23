import { execFileSync } from "node:child_process";

/**
 * Пункт 25 документа владельца «баги шапки и меню»: «Выпадающее меню
 * раскрывается только по клику, а не по наведению. Ожидаемо: на десктопе
 * подменю раскрывается по наведению курсора. На телефоне — по нажатию».
 *
 * ЗАМЕР (рендер шапки пяти тем с трёхуровневым меню + Chromium 1440/375):
 *
 *   десктоп, наведение   rose/bloom/flux/satin — работало чистым CSS;
 *                        vanilla — подменю не было ВООБЩЕ: её маппинг пунктов
 *                        оставлял только label+href и терял `submenu`;
 *   телефон, шторка      все пять — вложенные уровни развёрнуты ВСЕГДА,
 *                        нажимать нечего.
 *
 * ПРАВКА. vanilla получила собственный NavItem (наведение чистым CSS, как у
 * соседей) и вложенные уровни в шторке. Шторки всех пяти тем раскрывают
 * вложенное нажатием на стрелку: разметка договаривается тремя атрибутами
 * (`data-nav-group` / `data-nav-sub-toggle` / `data-nav-sub`), обработчик один
 * на все темы — `packages/theme-base/runtime/nav-submenu-toggle.ts`.
 *
 * 24.09 владелец поменял десктоп: «не по ховеру, а по клику» — меню шапки
 * тоже раскрывается нажатием (тот же обработчик), см. header-menu-click.spec.ts.
 *
 * Замер после правки (21.09):
 *   наведение (1440): все пять — подменю скрыто → видно;
 *   нажатие  (375):  все пять — скрыто → видно.
 *
 * Гард смотрит РАЗМЕТКУ рендера, а не браузер: CI движков не ставит (на этой
 * волне браузерный гард падал в CI всеми проверками).
 */
const RENDERER = require.resolve("./render-theme-sections.mjs");
const THEMES = ["rose", "bloom", "flux", "satin", "vanilla"] as const;

const NAV = [
  {
    label: "Каталог",
    href: "/catalog",
    submenu: [
      {
        label: "Наушники",
        href: "/collections/naushniki",
        submenu: [{ label: "TWS", href: "/collections/tws" }],
      },
      { label: "Колонки", href: "/collections/kolonki" },
    ],
  },
  { label: "О нас", href: "/about" },
];

function renderHeader(theme: string, menuType = "dropdown"): string {
  const props = {
    id: "Header-1",
    menuType,
    logoPosition: "center-left",
    navigationLinks: NAV,
    links: NAV,
  };
  const out = execFileSync(
    "node",
    [RENDERER, theme, JSON.stringify([{ block: "Header", props, live: true }])],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
  if (res.error) throw new Error(`${theme}: ${res.error}`);
  return res.html ?? "";
}

/** Разметка шторки без вставленного исходника обработчика. */
function drawerMarkup(html: string, theme: string): string {
  const at = html.indexOf(`id="${theme}-burger"`);
  if (at < 0) return "";
  const tail = html.slice(at);
  const script = tail.indexOf("__merfyNavSubmenuToggle");
  return script > 0 ? tail.slice(0, script) : tail;
}

describe("вложенное меню: нажатие на десктопе и в шторке", () => {
  it.each(THEMES)("%s: вложенные пункты вообще доезжают до шапки", (theme) => {
    const html = renderHeader(theme);
    // vanilla теряла их в маппинге пропов — до шапки не доходило ничего.
    expect({ theme, второйУровень: html.includes("Наушники") }).toEqual({
      theme,
      второйУровень: true,
    });
  });

  it.each(THEMES)(
    "%s: на десктопе подменю раскрывается нажатием, не наведением",
    (theme) => {
      const html = renderHeader(theme);
      // Владелец 24.09: «не по ховеру, а по клику». Поведение нажатия — в
      // header-menu-click.spec.ts; здесь — что наведения в разметке не осталось.
      expect({
        theme,
        поНаведению: /group-hover\/(d1|d2|mega)/.test(html),
        кнопка: html.includes("data-nav-menu-toggle"),
      }).toEqual({ theme, поНаведению: false, кнопка: true });
    },
  );

  it.each(THEMES)(
    "%s: в шторке есть кнопка раскрытия и скрытый список",
    (theme) => {
      const drawer = drawerMarkup(renderHeader(theme), theme);
      expect({ theme, шторкаНайдена: drawer.length > 0 }).toEqual({
        theme,
        шторкаНайдена: true,
      });
      expect({
        theme,
        обёртка: drawer.includes("data-nav-group"),
        кнопка: drawer.includes("data-nav-sub-toggle"),
        скрытыйСписок:
          /data-nav-sub(?!-toggle)[^>]*\shidden|hidden[^>]*\sdata-nav-sub(?!-toggle)/.test(
            drawer,
          ),
      }).toEqual({ theme, обёртка: true, кнопка: true, скрытыйСписок: true });
    },
  );

  it.each(THEMES)("%s: обработчик раскрытия вставлен в шапку", (theme) => {
    expect({
      theme,
      обработчик: renderHeader(theme).includes("__merfyNavSubmenuToggle"),
    }).toEqual({ theme, обработчик: true });
  });

  it.each(THEMES)("%s: пункт без вложенных остаётся без кнопки", (theme) => {
    // Прежний вид сохраняется: магазины без вложенного меню не должны увидеть
    // никаких стрелок — ни в шторке, ни в инлайн-навигации.
    const props = {
      id: "Header-1",
      menuType: "dropdown",
      logoPosition: "center-left",
      navigationLinks: [{ label: "Каталог", href: "/catalog" }],
      links: [{ label: "Каталог", href: "/catalog" }],
    };
    const out = execFileSync(
      "node",
      [
        RENDERER,
        theme,
        JSON.stringify([{ block: "Header", props, live: true }]),
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
    if (res.error) throw new Error(`${theme}: ${res.error}`);
    const drawer = drawerMarkup(res.html ?? "", theme);
    expect({
      theme,
      лишняяКнопка: drawer.includes("data-nav-sub-toggle"),
    }).toEqual({
      theme,
      лишняяКнопка: false,
    });
  });
});
