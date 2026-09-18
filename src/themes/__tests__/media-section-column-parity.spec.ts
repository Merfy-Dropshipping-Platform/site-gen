/**
 * Картиночные секции: колонки сходятся внизу, кнопка не отрывается от текста,
 * пустой слот несёт дизайн-ассет.
 *
 * Баг-репорт владельца (2026-09-15, тема bloom): «в теме bloom сломана секция
 * "Галерея"», «"Изображение с текстом" — поломана», «"Слайд-шоу" — поломана».
 * Ориентир для починки — rose («как пример работы можешь брать у розы для всех
 * багов темы», владелец, 2026-09-15).
 *
 * ЗАМЕР «ДО» (Chromium 1440×2400, страница превью собрана тем же кодом, что
 * отдаёт сервис: preview-tailwind + CSS темы + buildTokensCss; данные —
 * канон-дефолт панели: изображение + товар + коллекция; 2026-09-15):
 *
 *   Галерея, разбег низов колонок     rose 0 · vanilla 0 · bloom 656 · satin 154 · flux 0
 *   Галерея, дыра под большой плиткой rose 0 · vanilla 48 · bloom 656 · satin −154 · flux 0
 *   Изобр. с текстом, провал текст→кнопка rose 32 · vanilla 40 · bloom 460 · satin 20 · flux 40
 *   Слайд-шоу, картинок у слайда без фото rose 2 · vanilla 2 · bloom 0 · satin 0 · flux 0
 *
 * ПРИЧИНЫ (по три, каждая своя, все — в bloom):
 *
 *  1. ГАЛЕРЕЯ. Композиция «большая плитка + стопка из двух» у rose и flux стоит
 *     на трёх вещах разом: несимметричные колонки на lg (rose
 *     `minmax(0,1fr) minmax(280px,429px)`, flux `875fr 429fr`), растяжка строки
 *     (`lg:items-stretch` / умолчание грида) и большая плитка, берущая высоту
 *     строки (`lg:h-full`). bloom не делал НИ ОДНОГО: `lg:grid-cols-2`
 *     (пополам), `items-start` и жёсткий `aspect-square`. Правая колонка из
 *     двух плиток 652/594 с подписями вдвое выше квадрата — отсюда 656px дыры.
 *
 *  2. ИЗОБРАЖЕНИЕ С ТЕКСТОМ. `ctaPosition: 'bottom-pinned'` в
 *     `packages/theme-bloom/theme.json → blockDefaults` + отсутствие
 *     `lg:items-center` на гриде. Это НЕ особенность bloom-порта: с тем же
 *     пропом rose даёт провал 524px, flux 449px, satin 572px (замер там же).
 *     Канон-дефолт блока — `inline` (в `ImageWithText.puckConfig` значения нет,
 *     порт читает `p.ctaPosition === 'bottom-pinned'`); его держат rose, flux и
 *     satin. `ctaPosition` — СКРЫТОЕ поле панели (`type: 'hidden'`), состав
 *     видимых параметров правка не трогает.
 *
 *  3. СЛАЙД-ШОУ. Слайд мерчанта без фото в bloom давал пустую поверхность, а в
 *     bloom `--color-surface` РАВЕН `--color-bg` во всех четырёх схемах темы —
 *     то есть «заливка без изображения». rose на том же месте кладёт
 *     дизайн-ассет `/placeholders/landscape-slideshow.png`. Внутри самого bloom
 *     это ещё и рассогласование: пустая плитка «Галереи» и пустое медиа
 *     «Изображения с текстом» дизайн-ассет получают, слайд — нет.
 *
 * ЧТО СТОРОЖИМ. Не классы «на глаз», а свойства, которые их выражают: значение
 * берём победителем каскада среди утилит узла в РЕАЛЬНЫХ бандлах превью
 * (`dist/preview-tailwind.css` + `dist/theme-css/<тема>.css`) плюс инлайн-стиль
 * узла. Утилиты Tailwind — селекторы из одного класса, специфичность равна,
 * выигрывает объявленное ниже; базовые правила бандл печатает до
 * `@media (min-width:64rem)`, поэтому «последнее объявление» и есть значение на
 * ≥1024px. Резолвер откалиброван по настоящему Chromium: на rose и flux он
 * обязан давать ровно те `align-items`/`height`, при которых замер дал Δ=0 —
 * это отдельная проверка ниже, без неё гард сторожил бы свою фикстуру.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 *                 && pnpm build:preview-tailwind
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

// Первый рендер каждой темы холодный: отдельный процесс + рантайм astro. Под
// нагрузкой (параллельная пересборка) он выходит за штатные 5000 мс, и падала
// РОВНО одна проверка — не по сути, а по таймауту. Ловля 2026-09-15 на
// контрольном саботаже: два повтора того же дерева давали 69/69.
jest.setTimeout(120_000);

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const THEMES = ["rose", "vanilla", "bloom", "satin", "flux"] as const;
type Theme = (typeof THEMES)[number];

// ─────────────────────────── рендер секций ───────────────────────────

const кэш = new Map<string, string>();

function render(theme: Theme, block: string, props: Record<string, unknown>): string {
  const ключ = `${theme}::${block}::${JSON.stringify(props)}`;
  const готовое = кэш.get(ключ);
  if (готовое !== undefined) return готовое;
  const jobs = [
    { block, cascade: true, live: true, props: { id: `${block}-1`, ...props } },
  ];
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (JSON.parse(raw) as Record<string, string>[])[0];
  if (row.html === undefined) {
    throw new Error(
      `рендер ${block} (${theme}) не дал HTML: ${JSON.stringify(row)}`,
    );
  }
  кэш.set(ключ, row.html);
  return row.html;
}

/** Канон-дефолт панели «Галереи»: изображение + товар + коллекция, ничего не выбрано. */
const CANON_ITEMS = [
  { id: "i1", type: "image", url: "", alt: "Изображение" },
  { id: "i2", type: "product", productId: null },
  { id: "i3", type: "collection", collectionId: null },
];

/** Три картинки одинаковых пропорций — набор без единой подписи. */
const IMAGE_ITEMS = [1, 2, 3].map((i) => ({
  id: `i${i}`,
  type: "image",
  url: "/placeholders/landscape-gallery.png",
  alt: `Изображение ${i}`,
}));

// ──────────────────── мини-каскад по реальным бандлам ────────────────────

const cssSelectorOf = (cls: string) =>
  `.${cls.replace(/[.[\]()#/%,:!*+~='"^$&{}|<>?\\]/g, (ch) => `\\${ch}`)}`;
const forRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

const бандлы = new Map<Theme, string>();
function bundleOf(theme: Theme): string {
  const готовое = бандлы.get(theme);
  if (готовое !== undefined) return готовое;
  const tw = resolve(SITES_ROOT, "dist", "preview-tailwind.css");
  const th = resolve(SITES_ROOT, "dist", "theme-css", `${theme}.css`);
  if (!existsSync(tw)) throw new Error("нет dist/preview-tailwind.css — pnpm build:preview-tailwind");
  if (!existsSync(th)) throw new Error(`нет dist/theme-css/${theme}.css — pnpm build:theme-sections:all`);
  const css = `${readFileSync(tw, "utf-8")}\n${readFileSync(th, "utf-8")}`;
  бандлы.set(theme, css);
  return css;
}

/**
 * Разбор класса на варианты и утилиту с учётом скобок: в произвольных значениях
 * Tailwind двоеточие встречается внутри `[...]`, наивный split его резал бы.
 */
function variantsOf(cls: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of cls) {
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    if (ch === ":" && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  return out;
}

/**
 * Ранг класса на окне ≥1024px. null — класс на этом окне не применяется
 * (`xl:`/`2xl:` начинаются выше, `max-*`, состояния и темы — не про покой).
 * Ранг нужен, потому что байтовое смещение в бандле не отражает брейкпоинт:
 * CSS темы печатается ПОСЛЕ preview-tailwind, и базовое правило темы стояло бы
 * «ниже» lg-правила tailwind, хотя на 1024px выигрывает lg.
 */
const РАНГ: Record<string, number> = { sm: 1, md: 2, lg: 3 };
function rankAt1024(cls: string): number | null {
  const variants = variantsOf(cls);
  let rank = 0;
  for (const v of variants) {
    const r = РАНГ[v];
    if (r === undefined) return null;
    rank = Math.max(rank, r);
  }
  return rank;
}

/** Победитель каскада среди утилит узла на ≥1024px; null — никто не объявил. */
function winningDecl(css: string, classes: string[], prop: string): string | null {
  let best: { rank: number; at: number; value: string } | null = null;
  for (const cls of classes) {
    const rank = rankAt1024(cls);
    if (rank === null) continue;
    const re = new RegExp(`${forRegExp(cssSelectorOf(cls))}\\s*\\{([^}]*)\\}`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      // Тело правила может быть вложенным `@media (width >= 64rem) { … }` —
      // объявление тогда стоит с начала строки, а не после `;`.
      const decl = new RegExp(`(?:^|[;{\\n])\\s*${prop}\\s*:\\s*([^;}]+)`).exec(m[1]);
      if (!decl) continue;
      if (!best || rank > best.rank || (rank === best.rank && m.index > best.at))
        best = { rank, at: m.index, value: decl[1].trim() };
    }
  }
  return best?.value ?? null;
}

/** Объявление из инлайн-стиля узла — оно сильнее любой утилиты. */
function inlineDecl(style: string, prop: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(style);
  return m ? m[1].trim() : null;
}

/** Значение свойства узла на ≥1024px: инлайн сильнее утилит. */
function prop(theme: Theme, el: HTMLElement, name: string): string | null {
  const inline = inlineDecl(el.getAttribute("style") ?? "", name);
  if (inline) return inline;
  const classes = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  return winningDecl(bundleOf(theme), classes, name);
}

// ─────────────────────── разбор композиции секции ───────────────────────

type GalleryShape = {
  hero: HTMLElement;
  row: HTMLElement;
  side: HTMLElement;
  sideCount: number;
  /** боковая колонка — стопка (rose/bloom/satin/flux/vanilla) или ряд */
  stacked: boolean;
};

/**
 * Композиция «большая плитка + соседняя колонка». Низами сходятся ВСЕ её
 * формы: стопка (rose/bloom/satin/flux/vanilla).
 *
 * Баг-репорт владельца 2026-09-18: у vanilla при трёх плитках верхняя не
 * делила полотно с соседями — все три были сиблингами ОДНОЙ сетки
 * `grid-cols-2`, отсюда неровный «уголок» с дырой (замер: 2 плитки в ряд,
 * третья одна под левой). Порт `themes/vanilla/src/components/sections/
 * Gallery.astro` перестроен на тот же паттерн, что rose/bloom/satin
 * (`minmax(0,1fr) minmax(280px,429px)`): большая плитка — прямой сиблинг
 * строки, остальные — в боковой обёртке `flex flex-col`, тоже сиблинге
 * строки. С этого момента vanilla ТОЖЕ распознаётся структурно.
 */
function galleryShape(theme: Theme, html: string): GalleryShape | null {
  const root = parse(html);
  const tiles = root.querySelectorAll('[data-puck-subsection-field="items"]');
  if (tiles.length < 2) return null;
  const hero = tiles[0];
  const side = tiles[1].parentNode as HTMLElement;
  const row = hero.parentNode as HTMLElement;
  // Большая плитка и боковая обёртка обязаны быть СОСЕДЯМИ одной строки —
  // композиция исключается этим условием, а не списком тем.
  if (!side || !row || side === row || side.parentNode !== row) return null;
  const sideKids = side.childNodes.filter(
    (n): n is HTMLElement => (n as HTMLElement).tagName !== undefined,
  );
  if (sideKids.length < 1) return null;
  // стопка? у flux колонка становится стопкой только на lg (`lg:flex-col`),
  // поэтому смотрим победителя каскада, а не базовый класс.
  const dir = prop(theme, side, "flex-direction");
  const cols = prop(theme, side, "grid-template-columns");
  const stacked =
    dir === "column" || (dir === null && (cols === null || !/\s/.test(cols)));
  return { hero, row, side, sideCount: sideKids.length, stacked };
}

/** Темы с композицией «большая плитка + колонка» — их и проверяем. */
const COLUMN_GALLERY_THEMES: Theme[] = ["rose", "vanilla", "bloom", "satin", "flux"];
/**
 * Из них со СТОПКОЙ справа — только им нельзя делить полотно пополам.
 *
 * Баг-репорт владельца 2026-09-16 (скриншот): в satin «Товар» стоял СПРАВА-
 * СВЕРХУ, «Выбери коллекцию» — СПРАВА-СНИЗУ (стопка), а не рядом. Прежняя
 * калибровка здесь (satin — «ряд», единственный из четырёх) закрывала ТОЛЬКО
 * 154px разбега низов (bloom/satin, замер 2026-09-15), а не саму структуру:
 * satin делил полотно `lg:grid-cols-2` пополам и рисовал боковые плитки СВОЕЙ
 * строкой (`grid grid-cols-2`) — рядом друг с другом, а не стопкой под узкой
 * колонкой (`minmax(280px,429px)`), как rose/bloom/flux. 0px разбега низов при
 * этом получались — заплатка `lg:h-full`/`lg:flex-1` работала, — а состав
 * колонок оставался чужим. Теперь satin — четвёртая тема со стопкой.
 *
 * Баг-репорт владельца 2026-09-18: vanilla делила полотно `grid-cols-2`
 * пополам между ВСЕМИ плитками (не было ни большой плитки, ни колонки вовсе).
 * После починки (порт зеркалит rose/bloom/satin: `minmax(0,1fr)
 * minmax(280px,429px)` + боковая `flex flex-col`) vanilla — пятая тема со
 * стопкой.
 */
const STACKED_GALLERY_THEMES: Theme[] = ["rose", "vanilla", "bloom", "satin", "flux"];

// ───────────────────────────── калибровка ─────────────────────────────

describe("резолвер каскада откалиброван по эталонам", () => {
  it("rose и flux: строка растягивает элементы, большая плитка берёт высоту строки", () => {
    for (const theme of ["rose", "flux"] as const) {
      const shape = galleryShape(theme, render(theme, "Gallery", { colorScheme: "scheme-3", items: CANON_ITEMS }));
      expect(shape).not.toBeNull();
      const align = prop(theme, shape!.row, "align-items");
      const height = prop(theme, shape!.hero, "height");
      expect({ theme, align, height }).toEqual({
        theme,
        align: theme === "rose" ? "stretch" : null, // flux не объявляет — умолчание грида и есть stretch
        height: "100%",
      });
    }
  });

  it("композиция распознаётся структурно: колонка у всех пяти тем (rose/vanilla/bloom/satin/flux)", () => {
    const found = THEMES.filter(
      (t) => galleryShape(t, render(t, "Gallery", { colorScheme: "scheme-3", items: CANON_ITEMS })) !== null,
    );
    expect(found).toEqual(COLUMN_GALLERY_THEMES);
  });

  it("стопка справа — у rose/bloom/satin/flux", () => {
    const stacked = COLUMN_GALLERY_THEMES.filter(
      (t) => galleryShape(t, render(t, "Gallery", { colorScheme: "scheme-3", items: CANON_ITEMS }))!.stacked,
    );
    expect(stacked).toEqual(STACKED_GALLERY_THEMES);
  });
});

// ───────────────────────────── 1. Галерея ─────────────────────────────

describe("Галерея: низ большой плитки сходится с низом соседней колонки", () => {
  const наборы: [string, unknown[]][] = [
    ["канон-дефолт (изображение + товар + коллекция)", CANON_ITEMS],
    ["три изображения без подписей", IMAGE_ITEMS],
    ["две плитки", IMAGE_ITEMS.slice(0, 2)],
  ];

  for (const theme of COLUMN_GALLERY_THEMES) {
    for (const [имя, items] of наборы) {
      it(`${theme}: ${имя} — строка растягивает элементы`, () => {
        const shape = galleryShape(theme, render(theme, "Gallery", { colorScheme: "scheme-3", items }));
        expect(shape).not.toBeNull();
        const align = prop(theme, shape!.row, "align-items");
        // null = свойство не объявлено, у грида умолчание stretch.
        expect([null, "stretch", "normal"]).toContain(align);
      });

      it(`${theme}: ${имя} — большая плитка берёт высоту строки`, () => {
        const shape = galleryShape(theme, render(theme, "Gallery", { colorScheme: "scheme-3", items }));
        expect(shape).not.toBeNull();
        expect(prop(theme, shape!.hero, "height")).toBe("100%");
      });

      it(`${theme}: ${имя} — аспект не держит высоту большой плитки на lg`, () => {
        const shape = galleryShape(theme, render(theme, "Gallery", { colorScheme: "scheme-3", items }));
        expect(shape).not.toBeNull();
        const ar = prop(theme, shape!.hero, "aspect-ratio");
        expect([null, "auto"]).toContain(ar);
      });
    }

    it(`${theme}: картинка большой плитки не задаёт высоту строки`, () => {
      const shape = galleryShape(theme, render(theme, "Gallery", { colorScheme: "scheme-3", items: IMAGE_ITEMS }));
      expect(shape).not.toBeNull();
      const img = shape!.hero.querySelector("img");
      expect(img).not.toBeNull();
      // Картинка в потоке с `height:100%` против гибкого бокса нулевой базы
      // разрешается как auto — и высоту строки начинает задавать размер файла.
      // Ловля 2026-09-15: с загруженным 1080×1080 плитка satin возвращалась к
      // 592×592, хотя обёртки формально сходились низами (замер «чернил» —
      // нижняя кромка последнего ВИДИМОГО узла — показывал прежние 154px).
      expect(prop(theme, img as HTMLElement, "position")).toBe("absolute");
    });

    if (!STACKED_GALLERY_THEMES.includes(theme)) continue;

    it(`${theme}: колонки на lg не делятся пополам под стопкой из двух плиток`, () => {
      const shape = galleryShape(theme, render(theme, "Gallery", { colorScheme: "scheme-3", items: CANON_ITEMS }));
      expect(shape).not.toBeNull();
      expect(shape!.sideCount).toBeGreaterThanOrEqual(2);
      const cols = prop(theme, shape!.row, "grid-template-columns");
      expect(cols).not.toBeNull();
      // `grid-cols-2` печатается как repeat(2,minmax(0,1fr)) — две равные
      // гибкие колонки. Стопка из двух почти квадратных плиток с подписями
      // выше квадрата ВСЕГДА, поэтому пополам делить нельзя.
      expect(cols).not.toMatch(/^repeat\(\s*2\s*,\s*minmax\(0(?:px)?\s*,\s*1fr\)\s*\)$/);
    });

    it(`${theme}: боковая колонка не уже большой плитки до lg`, () => {
      const shape = galleryShape(theme, render(theme, "Gallery", { colorScheme: "scheme-3", items: CANON_ITEMS }));
      expect(shape).not.toBeNull();
      // До lg сетка в одну колонку: потолок ширины на боковой обёртке рисует
      // две плитки разной ширины друг под другом. У rose и flux потолка нет.
      const maxW = prop(theme, shape!.side, "max-width");
      expect([null, "none", "100%"]).toContain(maxW);
    });
  }
});

// ─────────────────── 2. Изображение с текстом ───────────────────

/** Обёртка кнопки в отрендеренной секции (у неё и живёт mt-auto). */
function ctaWrapper(html: string): HTMLElement | null {
  const root = parse(html);
  const btn = root.querySelector('[data-puck-subsection-field="button"]');
  return (btn?.parentNode as HTMLElement) ?? null;
}

describe("Изображение с текстом: кнопка остаётся при тексте", () => {
  for (const theme of THEMES) {
    it(`${theme}: дефолт секции не прижимает кнопку к низу колонки`, () => {
      const html = render(theme, "ImageWithText", { colorScheme: "scheme-3" });
      const wrap = ctaWrapper(html);
      expect(wrap).not.toBeNull();
      expect(prop(theme, wrap!, "margin-top")).not.toBe("auto");
    });

    it(`${theme}: дефолт темы не ставит ctaPosition: bottom-pinned`, () => {
      const manifest = JSON.parse(
        readFileSync(resolve(SITES_ROOT, "packages", `theme-${theme}`, "theme.json"), "utf-8"),
      ) as { blockDefaults?: Record<string, Record<string, unknown>> };
      const ctaPosition = manifest.blockDefaults?.ImageWithText?.ctaPosition;
      expect({ theme, ctaPosition: ctaPosition ?? null }).toEqual({
        theme,
        // vanilla тоже держит 'bottom-pinned', но её порт ctaPosition не
        // читает вовсе (кнопка без mt-auto, замер провала 40px) — значение
        // мёртвое. Трогать чужую тему в этой задаче нельзя, поэтому
        // отклонение зафиксировано здесь явно, а не замолчано.
        ctaPosition: theme === "vanilla" ? "bottom-pinned" : null,
      });
    });
  }

  it("bloom: текстовая колонка центрируется по вертикали относительно медиа (как rose)", () => {
    for (const theme of ["rose", "flux", "bloom"] as const) {
      const html = render(theme, "ImageWithText", { colorScheme: "scheme-3" });
      const root = parse(html);
      const media = root.querySelector('[data-puck-subsection-field="image"]');
      expect(media).not.toBeNull();
      const row = media!.parentNode as HTMLElement;
      expect(prop(theme, row, "align-items")).toBe("center");
    }
  });
});

// ───────────────────────────── 3. Слайд-шоу ─────────────────────────────

const SLIDE_ASSET = "/placeholders/landscape-slideshow.png";

/** Два слайда мерчанта без картинок — ровно случай из баг-репорта. */
const SLIDES_NO_IMAGE = [
  { id: "s1", heading: "Слайд-шоу", subtitle: "Подзаголовок", ctaText: "Кнопка" },
  { id: "s2", heading: "Второй", subtitle: "Текст", ctaText: "Кнопка" },
];

describe("Слайд-шоу: слайд без фото несёт дизайн-ассет", () => {
  // rose — ориентир владельца, bloom — цель. flux и satin на том же месте
  // рисуют пустую поверхность (0 картинок, замер в шапке); в bloom это видно
  // как «заливка без изображения», потому что --color-surface у неё равен
  // --color-bg во всех четырёх схемах. Решение по flux/satin — за владельцем,
  // поэтому их ожидание записано явным числом, а не пропущено.
  const ОЖИДАНИЕ: Record<Theme, number> = {
    rose: 2,
    // vanilla подставляет НЕ дизайн-ассет, а собственные мок-фото верстальщика
    // (`/images/vanilla-hero-slide-1.webp` и -2) — это ровно то, что контракт
    // картиночных секций запрещает. Отклонение чужой темы, в объём не входит.
    vanilla: 0,
    bloom: 2,
    satin: 0,
    flux: 0,
  };

  for (const theme of THEMES) {
    it(`${theme}: картинок-ассетов у двух слайдов без фото`, () => {
      const html = render(theme, "Slideshow", {
        colorScheme: "scheme-3",
        slides: SLIDES_NO_IMAGE,
      });
      const imgs = parse(html)
        .querySelectorAll("img")
        .filter((el) => (el.getAttribute("src") ?? "").includes(SLIDE_ASSET));
      expect({ theme, imgs: imgs.length }).toEqual({ theme, imgs: ОЖИДАНИЕ[theme] });
    });
  }

  it("bloom: слайд С фото мерчанта ассетом не подменяется", () => {
    const html = render("bloom", "Slideshow", {
      colorScheme: "scheme-3",
      slides: [{ id: "s1", image: "/uploads/своё.jpg", heading: "Своё" }],
    });
    const srcs = parse(html)
      .querySelectorAll("img")
      .map((el) => el.getAttribute("src") ?? "");
    expect(srcs).toContain("/uploads/своё.jpg");
    expect(srcs.some((s) => s.includes(SLIDE_ASSET))).toBe(false);
  });
});

// ───────────── 4. Слайд-шоу: нумерация и кнопка не в одном месте ─────────────

/**
 * Полоса нумерации по ЦЕНТРУ низа полотна (`absolute bottom-N left-1/2
 * -translate-x-1/2`). Только в этой форме она попадает под прижатый к низу
 * контент слайда: bloom и flux ставят её справа (`bottom-5 right-4`), vanilla —
 * отдельной полосой ПОД полотном, и там столкнуться не с чем.
 */
function centeredPager(root: HTMLElement): HTMLElement | null {
  return (
    root
      .querySelectorAll("div")
      .find((el) => {
        const c = el.getAttribute("class") ?? "";
        return /(^|\s)absolute(\s|$)/.test(c) && /left-1\/2/.test(c) && /(^|\s)bottom-\d/.test(c);
      }) ?? null
  );
}

/** Отступ полосы от низа из класса `bottom-N` (шаг Tailwind — 4px). */
function pagerOffset(el: HTMLElement): number {
  const m = /(?:^|\s)bottom-(\d+)(?:\s|$)/.exec(el.getAttribute("class") ?? "");
  return m ? Number(m[1]) * 4 : 0;
}

/**
 * Длина в пикселях. Tailwind v4 печатает шаг сетки как
 * `calc(var(--spacing) * N)`, где `--spacing` = 0.25rem = 4px, поэтому одной
 * проверки «оканчивается на px» мало — она молча давала бы ноль.
 */
function toPx(value: string | null): number {
  if (!value) return 0;
  const calc = /calc\(\s*var\(--spacing\)\s*\*\s*([\d.]+)\s*\)/.exec(value);
  if (calc) return Number.parseFloat(calc[1]) * 4;
  if (value.endsWith("px")) return Number.parseFloat(value);
  if (value.endsWith("rem")) return Number.parseFloat(value) * 16;
  return 0;
}

/** Сумма нижних отступов от кнопки вверх до корня секции. */
function reservedBelowCta(theme: Theme, root: HTMLElement, cta: HTMLElement): number {
  let sum = 0;
  let node: HTMLElement | null = cta;
  while (node && node !== root) {
    sum += toPx(prop(theme, node, "padding-bottom"));
    node = node.parentNode as HTMLElement | null;
  }
  return sum;
}

describe("Слайд-шоу: нумерация не садится на кнопку слайда", () => {
  /**
   * Высота полосы нумерации: цифра 14px в кнопке — 24px с запасом (замер
   * Chromium: цифры 8×14, полоса `bottom-5` = 20px от низа). Контент обязан
   * зарезервировать снизу не меньше, чем занимают отступ и полоса вместе.
   */
  const ВЫСОТА_ПОЛОСЫ = 24;
  // 2026-09-17: bloom и flux переведены на центральную полосу по жалобе
  // владельца («на блуме и флюкс стрелки справа, а не по центру»,
  // «нумерация при добавлении медиа уезжает»). Раньше здесь стояло
  // ["rose", "satin"] — тест закреплял прежнее правое положение как канон.
  const ЦЕНТРАЛЬНАЯ: Theme[] = ["rose", "bloom", "satin", "flux"];

  it("полоса по центру низа — у rose, bloom, satin и flux; у vanilla под полотном", () => {
    const found = THEMES.filter((t) => {
      const html = render(t, "Slideshow", {
        colorScheme: "scheme-3",
        slides: SLIDES_NO_IMAGE,
        pagination: "numbers",
      });
      return centeredPager(parse(html)) !== null;
    });
    expect(found).toEqual(ЦЕНТРАЛЬНАЯ);
  });

  for (const theme of ЦЕНТРАЛЬНАЯ) {
    it(`${theme}: контент слайда резервирует полосу нумерации`, () => {
      const root = parse(
        render(theme, "Slideshow", {
          colorScheme: "scheme-3",
          slides: SLIDES_NO_IMAGE,
          pagination: "numbers",
        }),
      );
      const pager = centeredPager(root);
      expect(pager).not.toBeNull();
      const cta = root
        .querySelectorAll("a")
        .find((el) => (el.textContent ?? "").trim() === "Кнопка");
      expect(cta).not.toBeUndefined();
      const нужно = pagerOffset(pager!) + ВЫСОТА_ПОЛОСЫ;
      const есть = reservedBelowCta(theme, root as unknown as HTMLElement, cta as HTMLElement);
      expect({ theme, есть: есть >= нужно, нужно }).toEqual({ theme, есть: true, нужно });
    });
  }
});
