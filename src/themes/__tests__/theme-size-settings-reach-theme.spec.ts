/**
 * Размерные настройки темы: канал «Кегль заголовка Hero»/«Кегль пунктов меню»
 * у bloom СНЯТ, у розы остаётся эталоном.
 *
 * История. Жалоба владельца 2026-09-15: «в теме bloom размеры всей темы и всех
 * секций не совпадают ни с чем — она в разы меньше всех настроек и остальных
 * тем». 21473d98 подключил у bloom оба канала (`--size-hero-heading`,
 * `--size-nav-link`) точно по каналу розы.
 *
 * Владелец, 2026-09-16 (откат): «вернуть размеры темы… размеры слетели не
 * текстов» + «верни типографику, если её увеличение было ошибочным — сверься…
 * с тем, как было до 21473d98». Разбор показал: дефолт темы (theme.json) уже
 * был верным (20px, чинился ОТДЕЛЬНЫМ коммитом d7acff5b 13.09, ДО 21473d98) —
 * магазины без правки настройки не двигались ни на пиксель. Но у ЖИВОГО
 * тестового стенда f7593c5f8f8f настройка уже стояла нештатно ДО 21473d98
 * (замер :root на 16.09 — `--size-hero-heading: 48px`, `--size-nav-link: 14px`;
 * сам 21473d98 фиксировал то же самое как «настройка 48px/14px, нарисовано
 * 20px/16px» — то есть канал был подключён к уже нештатным данным одного
 * тестового сайта). Подключение канала сделало эти нештатные данные видимыми
 * (h1 48px, кегль меню 14px) — визуально «типографика увеличилась», хотя
 * дефолт темы не сдвигался. Правку живых данных этого сайта агент делать не
 * вправе (правило `AGENTS.md` — не писать в живые сайты), поэтому канал снят:
 * bloom больше НЕ читает ни `--size-hero-heading`, ни `--size-nav-link` —
 * ровно так же, как flux/satin/vanilla не читают `--size-hero-heading`
 * (единственное отличие — flux ДОПОЛНИТЕЛЬНО читает мерчантский
 * `--merchant-hero-heading`, см. ниже).
 *
 * Что сторожим — СЛЕДСТВИЕ, а не имя класса: классы отрисованного заголовка
 * разрешаем по НАСТОЯЩЕМУ собранному CSS темы (dist/theme-css/<тема>.css) и
 * смотрим объявления `font-size`, которые доедут до браузера.
 *
 * Роза и flux держатся в проверке живыми образцами (канал розы — эталон на
 * будущее, если решат подключать другие темы осознанно).
 *
 * Требует сборки (тот же порядок, что в CI):
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "node-html-parser";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");

type Theme = "rose" | "bloom" | "flux";
type Size = "small" | "medium" | "large";

/**
 * Канал настройки «Кегль заголовка Hero» у каждой темы: имя переменной,
 * ступени лестницы, которые её читают, и значение по умолчанию на каждой.
 *
 * Значение по умолчанию — литерал вёрстки самой темы: магазин, где ползунок не
 * трогали, обязан остаться на прежнем кегле.
 *
 * bloom: `variable: null` — канал СНЯТ 16.09 (откат 21473d98, см. шапку файла).
 * `rungs: {}` выключает обе под-проверки «ступень читает переменную» и
 * «дефолт внутри var(…) = литерал» для ВСЕХ трёх ступеней разом.
 */
const HERO_CHANNEL: Record<
  Theme,
  { variable: string | null; rungs: Partial<Record<Size, string>>; placeholderReads: boolean }
> = {
  rose: { variable: "--size-hero-heading", rungs: { large: "40px" }, placeholderReads: true },
  bloom: { variable: null, rungs: {}, placeholderReads: false },
  flux: {
    variable: "--merchant-hero-heading",
    rungs: { small: "17px", medium: "20px", large: "24px" },
    // Пробел, замеренный 2026-09-15 (плейсхолдер героя настройку не читал),
    // закрыт 24.09: пустая секция берёт ступени «Размера заголовка» заполненной
    // ветки вместе с `--merchant-hero-heading` (тестер: «Изображение по всем
    // настройкам не принимает изменения»). Сторож: flux-empty-hero-settings.spec.ts.
    placeholderReads: true,
  },
};

/**
 * Литералы мобильной и планшетной ступеней лестницы заголовка героя. Сторожат
 * вторую половину: кегль ниже `lg` обязан остаться макетным, иначе «починка»
 * окажется подгонкой размеров. Сняты с портов тем.
 */
const HERO_LADDER: Record<Theme, Record<Size, [string, string]>> = {
  rose: {
    small: ["!text-[14px]", "md:!text-[25px]"],
    medium: ["!text-[17px]", "md:!text-[31px]"],
    large: ["!text-[20px]", "md:!text-[36px]"],
  },
  bloom: {
    small: ["text-[13px]", "md:text-[14px]"],
    medium: ["text-[15px]", "md:text-[17px]"],
    large: ["text-[18px]", "md:text-[20px]"],
  },
  flux: {
    small: ["text-[14px]", "md:text-[17px]"],
    medium: ["text-[17px]", "md:text-[20px]"],
    large: ["text-[20px]", "md:text-[24px]"],
  },
};

/** Литерал пункта меню шапки — он же значение по умолчанию `--size-nav-link`. */
const NAV_FALLBACK: Record<Theme, string> = { rose: "16px", bloom: "16px", flux: "16px" };
/**
 * Читает ли тема `--size-nav-link` вообще. bloom — нет (канал снят 16.09,
 * см. шапку файла); rose/flux читали канал ещё до 21473d98 и не затронуты.
 */
const NAV_CHANNEL: Record<Theme, boolean> = { rose: true, bloom: false, flux: true };

const THEMES: Theme[] = ["rose", "bloom", "flux"];
const SIZES: Size[] = ["small", "medium", "large"];

/**
 * CSS темы → плоские правила «селектор → объявления».
 *
 * Разбор именно посимвольный, а не регуляркой: tailwind v4 кладёт брейкпоинт
 * ВНУТРЬ правила (`.lg\\:text-…{@media (width>=64rem){font-size:…}}`), и плоская
 * регулярка `([^{}]+)\{([^{}]*)\}` считает селектором сам `@media`, теряя класс.
 * Ровно на этом сторож в первой редакции был слеп: показывал ноль читателей
 * настройки даже у flux, где канал заведомо жив. Вложенность @media теряем
 * намеренно — размер, включённый только на одном вьюпорте, это тот же размер.
 */
function flatRules(theme: Theme): { sel: string; body: string }[] {
  const path = resolve(SITES_ROOT, "dist", "theme-css", `${theme}.css`);
  if (!existsSync(path)) {
    throw new Error(`нет ${path} — нужен pnpm build:theme-sections ${theme}`);
  }
  const css = readFileSync(path, "utf8").replace(/\\/g, "");
  const out: { sel: string; body: string }[] = [];
  const stack: (string | null)[] = [];
  let head = "";
  let decls = "";
  const current = (): string | null => {
    for (let i = stack.length - 1; i >= 0; i -= 1) if (stack[i]) return stack[i];
    return null;
  };
  const flush = () => {
    if (head.trim()) {
      decls += `${head};`;
      head = "";
    }
    const sel = current();
    if (sel && decls.trim()) out.push({ sel, body: decls });
    decls = "";
  };
  for (const ch of css) {
    if (ch === "{") {
      const h = head.trim();
      head = "";
      flush();
      stack.push(h.startsWith("@") ? null : h);
    } else if (ch === "}") {
      flush();
      stack.pop();
    } else if (ch === ";") {
      decls += `${head};`;
      head = "";
    } else {
      head += ch;
    }
  }
  return out;
}

const rulesCache = new Map<Theme, { sel: string; body: string }[]>();
const rulesFor = (theme: Theme): { sel: string; body: string }[] => {
  const ready = rulesCache.get(theme);
  if (ready) return ready;
  const built = flatRules(theme);
  rulesCache.set(theme, built);
  return built;
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Все объявления `font-size`, которые дадут классы узла на настоящем CSS темы.
 *
 * Класс ищем в тексте селектора целиком (`.md:text-[20px]`), а не по «имени до
 * двоеточия»: у tailwind v4 имя утилиты само содержит `:`, `[`, `(` и запятые.
 * Хвост `(?![\w-])` отсекает совпадение с более длинным классом-соседом.
 */
function fontSizeDecls(theme: Theme, classes: string[]): string[] {
  const out: string[] = [];
  for (const cls of classes) {
    const re = new RegExp(`\\.${escapeRe(cls)}(?![\\w-])`);
    for (const rule of rulesFor(theme)) {
      if (!re.test(rule.sel)) continue;
      for (const m of rule.body.matchAll(/font-size\s*:\s*([^;}]+)/g)) out.push(m[1].trim());
    }
  }
  return out;
}

/**
 * Читает ли объявление ИМЕННО эту переменную.
 *
 * Не `includes("var(--имя")`: такая проверка зелёная и на `var(--имяX,…)` —
 * саботаж переименованием переменной проходил мимо сторожа (поймано своей же
 * рукой 2026-09-15, ровно грабли «гард ловится на подстроку»).
 */
const readsVar = (decl: string, name: string): boolean =>
  new RegExp(`var\\(\\s*${name.replace(/[-]/g, "\\-")}\\s*[,)]`).test(decl);

const classesOf = (tag: string): string[] =>
  (/class="([^"]*)"/.exec(tag)?.[1] ?? "").split(/\s+/).filter(Boolean);

const renderCache = new Map<string, string>();
function render(theme: Theme, jobs: unknown[], key: string): string {
  const ready = renderCache.get(key);
  if (ready !== undefined) return ready;
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = JSON.parse(raw) as { html?: string; missing?: boolean; error?: string }[];
  const row = rows[0];
  if (row?.missing) throw new Error(`${key}: в теме ${theme} нет блока`);
  if (row?.error) throw new Error(`${key}: ошибка рендера — ${row.error}`);
  const html = row?.html ?? "";
  renderCache.set(key, html);
  return html;
}

function heroHeadingTag(theme: Theme, size: Size): string {
  const html = render(
    theme,
    [
      {
        block: "Hero",
        live: true,
        props: {
          id: "Hero-1",
          heading: { text: "ЗАГОЛОВОК ГЕРОЯ", size },
          subheading: "Подзаголовок",
        },
      },
    ],
    `${theme}:hero:${size}`,
  );
  const tag = /<h1\b[^>]*>/.exec(html)?.[0];
  if (!tag) throw new Error(`${theme}/${size}: в героe нет <h1>`);
  return tag;
}

/**
 * Ссылки меню шапки.
 *
 * Берём именно `nav a` с кеглем в классе: у обеих тем в шапке ещё живут
 * иконочные ссылки (корзина, избранное, вход) без типографики — им кегль меню
 * не адресован. Мобильная шторка бургера тоже сидит в `<nav>` и токен на
 * брейкпоинте `lg` не получает по устройству: выше `lg` она скрыта. Поэтому
 * сторожим НЕ «все до одной», а «десктопное меню целиком» — порог 4 закрывает
 * штатный набор пунктов и у bloom, и у flux.
 */
/**
 * Заголовок героя в ветке-ПЛЕЙСХОЛДЕРЕ (мерчант ещё ничего не заполнил).
 *
 * Отдельная ветка разметки со своим литералом заголовка: роза читает настройку
 * и здесь (themes/rose/.../Hero.astro:304), bloom до правки — нет.
 *
 * Гасить поля поимённо и идти живой цепочкой бесполезно: `blockDefaults` темы
 * подставляют заголовок обратно, `isEmpty` остаётся ложным, и проверка молча
 * уезжает на ЗАПОЛНЕННУЮ ветку — поймано своей же рукой 2026-09-15, саботаж
 * «снять токен у плейсхолдера» проходил зелёным. Поэтому берём сырые пропы
 * (без blockDefaults) и обязательно сверяем маркер пустого состояния: ушли не
 * туда — тест падает с внятным текстом, а не тихо проверяет соседа.
 */
const PLACEHOLDER_MARK = /Покажи и расскажи/;

function heroPlaceholderTag(theme: Theme): string {
  const html = render(
    theme,
    [{ block: "Hero", props: { id: "Hero-1" } }],
    `${theme}:hero:placeholder`,
  );
  if (!PLACEHOLDER_MARK.test(html)) {
    throw new Error(`${theme}: рендер ушёл не в плейсхолдер — маркер пустого состояния не найден`);
  }
  const tag = /<h1\b[^>]*>/.exec(html)?.[0];
  if (!tag) throw new Error(`${theme}: в пустом герое нет <h1>`);
  return tag;
}

function navLinkClasses(theme: Theme): string[] {
  const html = render(
    theme,
    [{ block: "Header", live: true, props: { id: "Header-1" } }],
    `${theme}:header`,
  );
  const links = parse(html)
    .querySelectorAll("nav a")
    .map((a) => a.classNames ?? "")
    .filter((cls) => /\btext-\[/.test(cls));
  if (links.length === 0) throw new Error(`${theme}: в шапке не найдено ни одной ссылки меню`);
  return links;
}

/**
 * Сколько пунктов десктопного меню обязаны читать настройку.
 *
 * Порог = штатный набор пунктов у самой скромной из трёх тем: роза рисует три
 * пункта, bloom четыре, flux пять. Мобильная шторка бургера сидит в том же
 * `<nav>` и токен на брейкпоинте `lg` не получает по устройству — выше `lg`
 * она скрыта, поэтому в счёт не идёт. Проверено саботажем: снятие токена
 * роняет число читателей в ноль.
 */
const NAV_MIN_READERS = 3;

describe("размерные настройки темы доезжают до вёрстки", () => {
  describe.each(THEMES)("тема %s", (theme) => {
    const channel = HERO_CHANNEL[theme];

    describe.each(SIZES)("«Кегль заголовка Hero», ступень %s", (size) => {
      const fallback = channel.rungs[size];

      // rungs непустой ⇒ канал этой темы подключён ⇒ variable гарантированно строка
      // (bloom, у которой канал снят, идёт с rungs: {} и сюда не заходит вовсе).
      const variable = channel.variable;
      if (fallback && variable) {
        it(`ступень читает ${variable}`, () => {
          const decls = fontSizeDecls(theme, classesOf(heroHeadingTag(theme, size)));
          const reading = decls.filter((d) => readsVar(d, variable));
          expect({
            тема: theme,
            ступень: size,
            переменная: variable,
            объявленияFontSize: decls,
            читающихНастройку: reading.length,
          }).toEqual({
            тема: theme,
            ступень: size,
            переменная: variable,
            объявленияFontSize: decls,
            читающихНастройку: expect.any(Number),
          });
          expect(reading.length).toBeGreaterThan(0);
        });

        it("значение по умолчанию = литерал вёрстки (магазин без правки не едет)", () => {
          const decls = fontSizeDecls(theme, classesOf(heroHeadingTag(theme, size)));
          const found = decls
            .map(
              (d) =>
                new RegExp(`var\\(\\s*${variable}\\s*,\\s*([^)]+)\\)`).exec(d)?.[1]?.trim(),
            )
            .filter((v): v is string => Boolean(v));
          expect(found.length).toBeGreaterThan(0);
          for (const value of found) expect(value).toBe(fallback);
        });
      } else {
        // Ступень БЕЗ канала (rose small/medium — намеренно; ВСЕ ступени bloom —
        // канал снят 16.09). Негативная сторона той же проверки: НИ ОДНО
        // объявление font-size этой ступени не смеет читать var(--size-*) —
        // иначе саботаж «тихо вернуть канал» прошёл бы мимо гарда незамеченным
        // (проверено: возврат `lg:text-[length:var(--size-hero-heading,20px)]`
        // в bloom Hero.astro красит именно эту проверку).
        it("ступень БЕЗ канала — ни одно объявление не читает var(--size-*)", () => {
          const decls = fontSizeDecls(theme, classesOf(heroHeadingTag(theme, size)));
          const reading = decls.filter((d) => /var\(\s*--size-[a-z0-9-]+/.test(d));
          expect({ тема: theme, ступень: size, объявленияFontSize: decls, читающихVar: reading }).toEqual(
            { тема: theme, ступень: size, объявленияFontSize: decls, читающихVar: [] },
          );
        });
      }

      it("мобильная и планшетная ступени остались макетными", () => {
        const classes = classesOf(heroHeadingTag(theme, size));
        const [mobile, tablet] = HERO_LADDER[theme][size];
        expect(classes).toContain(mobile);
        expect(classes).toContain(tablet);
      });
    });

    it("пустой герой (плейсхолдер): читает настройку кегля ровно так, как записано", () => {
      const decls = fontSizeDecls(theme, classesOf(heroPlaceholderTag(theme)));
      // Канал снят (variable === null, bloom) — сторожим ЛЮБОЙ var(--size-*), а
      // не только конкретное имя: тест обязан покраснеть и при возврате СТАРОГО
      // канала, и при подключении НОВОГО под другим именем.
      const reading = channel.variable
        ? decls.filter((d) => readsVar(d, channel.variable!))
        : decls.filter((d) => /var\(\s*--size-[a-z0-9-]+/.test(d));
      expect({
        тема: theme,
        переменная: channel.variable,
        читаетНастройку: reading.length > 0,
        объявленияFontSize: decls,
      }).toEqual({
        тема: theme,
        переменная: channel.variable,
        читаетНастройку: channel.placeholderReads,
        объявленияFontSize: decls,
      });
    });

    it(`«Кегль пунктов меню» ${NAV_CHANNEL[theme] ? "доезжает до ссылок десктопного меню" : "СНЯТ — ссылки остаются на литерале"}`, () => {
      const all = navLinkClasses(theme);
      const reading = all.filter((cls) =>
        fontSizeDecls(theme, cls.split(/\s+/).filter(Boolean)).some((d) =>
          readsVar(d, "--size-nav-link"),
        ),
      );
      expect({ тема: theme, ссылокВМеню: all.length, читающихНастройку: reading.length }).toEqual({
        тема: theme,
        ссылокВМеню: all.length,
        читающихНастройку: expect.any(Number),
      });
      if (NAV_CHANNEL[theme]) {
        expect(reading.length).toBeGreaterThanOrEqual(NAV_MIN_READERS);
      } else {
        // bloom, 16.09: канал снят — ни одна ссылка не читает переменную,
        // кегль пункта меню = чистый литерал вёрстки на любом магазине.
        expect(reading.length).toBe(0);
      }
    });

    it("значение по умолчанию пункта меню = литерал вёрстки", () => {
      const classes = navLinkClasses(theme).flatMap((cls) => cls.split(/\s+/).filter(Boolean));
      if (NAV_CHANNEL[theme]) {
        const fallbacks = fontSizeDecls(theme, classes)
          .map((d) => /var\(\s*--size-nav-link\s*,\s*([^)]+)\)/.exec(d)?.[1]?.trim())
          .filter((v): v is string => Boolean(v));
        expect(fallbacks.length).toBeGreaterThanOrEqual(NAV_MIN_READERS);
        for (const value of fallbacks) expect(value).toBe(NAV_FALLBACK[theme]);
      } else {
        // Канал снят: сам литерал text-[16px] обязан остаться в классах ссылок
        // (тот же порог NAV_MIN_READERS — иначе саботаж «стёр литерал совсем»
        // прошёл бы мимо этой проверки незамеченным).
        const literalReaders = classes.filter((cls) => cls === `text-[${NAV_FALLBACK[theme]}]`);
        expect(literalReaders.length).toBeGreaterThanOrEqual(NAV_MIN_READERS);
      }
    });
  });

  /**
   * Расхождение розы, flux и bloom по каналу настройки — факт, а не недосмотр.
   * Сторожим сам факт: если кто-то снова подключит канал bloom без явного
   * решения владельца, проверка покраснеет и заставит принять это осознанно.
   */
  it("канал «Кегля заголовка Hero» у розы, flux и bloom РАЗНЫЙ (известное расхождение)", () => {
    expect({
      rose: HERO_CHANNEL.rose.variable,
      bloom: HERO_CHANNEL.bloom.variable,
      flux: HERO_CHANNEL.flux.variable,
    }).toEqual({
      rose: "--size-hero-heading",
      bloom: null,
      flux: "--merchant-hero-heading",
    });
    expect(HERO_CHANNEL.bloom.rungs).toEqual({});
  });
});
