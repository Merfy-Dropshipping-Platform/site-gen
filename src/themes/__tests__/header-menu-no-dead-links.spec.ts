import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Пункты 16–17 документа владельца «баги шапки и меню»: «в вёрстке тем
 * прописаны пункты, которых нет в магазине — „Sign-up", „РЕГИСТРАЦИЯ",
 * „КОРЗИНА" и прочие демо-страницы; переход отдаёт 404».
 *
 * Замер уточнил формулировку. Сам 404 из отчёта —
 * `{"message":"Cannot GET /register","error":"Not Found","statusCode":404}` —
 * байт в байт ответ БЭКЕНДА sites, а не витрины: на живом магазине тот же адрес
 * отдаёт 200 (nginx подставляет заглушку). То есть тестер кликнул ссылку в
 * превью конструктора. Но пункт верен по сути: страницы `register` нет ни в
 * одном сиде темы, там только `login`.
 *
 * Зашитые «Корзина» и «Регистрация» стояли в шторке ПОСЛЕ цикла по меню
 * мерчанта — остатки демо-вёрстки, а не его настройка. Удалены у bloom, satin и
 * vanilla; rose и flux их не имели (там только `/`, `/login`, `/wishlist` —
 * всё существует).
 */
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const THEMES = ["rose", "bloom", "flux", "satin", "vanilla"] as const;

/** Меню мерчанта, по которому проверяем, что его пункты на месте. */
const LINKS = [
  { text: "Каталог", href: "/catalog" },
  { text: "О нас", href: "/about" },
];

function renderHeader(theme: string, menuType: string): string {
  const props = {
    id: "Header-1",
    colorScheme: "scheme-1",
    logoPosition: "center-left",
    menuType,
    navigationLinks: LINKS,
    links: LINKS,
  };
  const out = execFileSync(
    "node",
    [RENDERER, theme, JSON.stringify([{ block: "Header", props, live: true }])],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
  if (res.error) throw new Error(`${theme}/${menuType}: ${res.error}`);
  return res.html ?? "";
}

/** Адреса, которых нет ни в одном сиде тем. */
const DEAD_HREFS = [
  'href="/register"',
  'href="/auth/sign-up"',
  'href="/auth/sign-in"',
];

describe("меню шапки не ведёт на несуществующие страницы", () => {
  const rendered = new Map<string, string>();
  beforeAll(() => {
    for (const theme of THEMES)
      rendered.set(theme, renderHeader(theme, "sidebar"));
  }, 180000);

  it.each(THEMES)(
    "%s: нет ссылок на страницы, которых нет в сидах",
    (theme) => {
      const html = rendered.get(theme)!;
      for (const href of DEAD_HREFS) {
        expect({ theme, href, есть: html.includes(href) }).toEqual({
          theme,
          href,
          есть: false,
        });
      }
    },
  );

  it.each(THEMES)("%s: нет зашитого пункта «Регистрация»", (theme) => {
    expect(rendered.get(theme)!).not.toMatch(/>\s*Регистрация\s*</);
  });

  it.each(THEMES)(
    "%s: меню мерчанта на месте",
    (theme) => {
      // Страховка от «убрали лишнее вместе с нужным»: ссылка мерчанта обязана
      // остаться в разметке при любом типе меню.
      for (const menuType of ["dropdown", "sidebar"]) {
        const html = renderHeader(theme, menuType);
        expect({
          theme,
          menuType,
          есть: html.includes('href="/catalog"'),
        }).toEqual({
          theme,
          menuType,
          есть: true,
        });
      }
    },
    180000,
  );
});
