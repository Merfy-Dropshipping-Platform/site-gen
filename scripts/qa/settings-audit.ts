/**
 * Аудит настроек: какие поля панели НЕ меняют разметку витрины.
 *
 * ЗАЧЕМ. Владелец 22.09: «кидаю эти задачи уже пятый раз». Класс «настройка
 * сохраняется, но ничего не делает» тестер находит по одному пункту: размер
 * заголовка, контейнер, положение видео, ссылка кнопки… Здесь он ищется СРАЗУ
 * по всем секциям всех тем.
 *
 * КАК. Имена и допустимые значения берутся ИЗ САМОЙ ПАНЕЛИ (`*.puckConfig.ts`),
 * а не выдумываются: половина ложных вердиктов 21.09 была именно из-за
 * выдуманных ключей (`videoPosition` вместо `position`, `containerEnabled`
 * вместо `container`). Затем секция рендерится дважды — с двумя разными
 * значениями поля — и разметка сравнивается.
 *
 * Запуск: pnpm exec tsx scripts/qa/settings-audit.ts [--json путь] [--theme t]
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { renderSections } from "./lib/render";

const SITES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ТЕМЫ = ["rose", "bloom", "satin", "vanilla", "flux"] as const;

/** Поля, которые нечем осмысленно перебрать или которые не про разметку. */
const ПРОПУСК_ТИПОВ = new Set([
  "section-header",
  "hidden",
  "array",
  "object",
  "image",
  "pagePicker",
  "collectionPicker",
  "productPicker",
  // Обёртку схемы ставит СБОРЩИК СТРАНИЦЫ, а не блок: одиночный рендер её не
  // видит и любая схема выглядела бы «мёртвой» во всех секциях сразу. Цвета
  // сторожит отдельная матрица схем (pnpm test:scheme-targets).
  "colorScheme",
]);

type Поле = { тип: string; значения: unknown[] };
type Панель = {
  тест: Record<string, Поле>;
  объявлены: Array<{ имя: string; тип: string; тело: string }>;
};

/** Два различимых значения поля — по его объявлению в панели. */
function значенияПоля(f: Record<string, unknown>): unknown[] | null {
  const тип = String(f.type ?? "");
  if (ПРОПУСК_ТИПОВ.has(тип)) return null;
  if (тип === "toggle") return ["true", "false"];
  if (тип === "select" || тип === "radio") {
    const opts = (f.options ?? []) as Array<{ value?: unknown }>;
    const vals = opts.map((o) => o?.value).filter((v) => v !== undefined);
    return vals.length >= 2 ? [vals[0], vals[1]] : null;
  }
  if (тип === "colorScheme") return ["scheme-1", "scheme-2"];
  if (тип === "alignment") return ["left", "right"];
  if (тип === "padding")
    return [
      { top: 0, bottom: 0 },
      { top: 120, bottom: 120 },
    ];
  if (тип === "slider" || тип === "number") {
    const min = typeof f.min === "number" ? f.min : 0;
    const max = typeof f.max === "number" ? f.max : 100;
    return min === max ? null : [min, max];
  }
  if (тип === "text" || тип === "aiText" || тип === "textarea") {
    return ["НАСТРОЙКА_А", "НАСТРОЙКА_Б"];
  }
  return null;
}

/**
 * Комментарии прочь — код внутри скобок должен быть сбалансирован.
 *
 * Разбор считает вложенность по скобкам, а в комментариях панелей их полно и
 * они не парные: «(владелец, 2026-09-13: „такого поля отродясь не было“»,
 * «text/link/size», «min-h 24/32/40/48)». Без чистки счётчик уезжал, соседние
 * поля слипались в одно и ПРОПАДАЛИ из аудита молча: у «Промо-баннера»
 * читалось 3 поля из 6 — «Текст» терялся, баннер рендерился пустым, и «Размер»
 * объявлялся мёртвым, хотя работает во всех пяти темах.
 *
 * Кавычки уважаем: в значениях встречаются '/catalog' и 'https://…', и
 * простое вырезание «// до конца строки» съело бы половину объявления.
 */
function безКомментариев(src: string): string {
  let out = "";
  let i = 0;
  let кавычка: string | null = null;
  while (i < src.length) {
    const c = src[i];
    const c2 = src[i + 1];
    if (кавычка) {
      out += c;
      if (c === "\\") {
        out += c2 ?? "";
        i += 2;
        continue;
      }
      if (c === кавычка) кавычка = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      кавычка = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && c2 === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Поля панели блока — читаем исходник, чтобы не тянуть TS-модуль. */
function поляБлока(файл: string): Панель {
  const src = безКомментариев(readFileSync(файл, "utf-8"));
  const i = src.indexOf("fields: {");
  if (i < 0) return { тест: {}, объявлены: [] };
  let depth = 1;
  let j = i + "fields: {".length;
  let body = "";
  while (j < src.length && depth > 0) {
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    if (depth > 0) body += c;
    j++;
  }
  const out: Record<string, Поле> = {};
  const объявлены: Array<{ имя: string; тип: string; тело: string }> = [];
  let d = 0;
  let cur = "";
  const сбросить = (txt: string) => {
    const km = txt.match(/^[\s\n]*\[?'?([a-zA-Z_]\w*)'?/);
    const tm = txt.match(/type:\s*'([^']+)'/);
    if (!km || !tm) return;
    объявлены.push({ имя: km[1], тип: tm[1], тело: txt });
    const f: Record<string, unknown> = { type: tm[1] };
    const opts = [...txt.matchAll(/value:\s*'([^']*)'/g)].map((m) => ({
      value: m[1],
    }));
    if (opts.length) f.options = opts;
    const min = txt.match(/min:\s*(-?\d+)/);
    const max = txt.match(/max:\s*(-?\d+)/);
    if (min) f.min = Number(min[1]);
    if (max) f.max = Number(max[1]);
    const знач = значенияПоля(f);
    if (знач) out[km[1]] = { тип: tm[1], значения: знач };
  };
  for (const ch of body) {
    if (ch === "{" || ch === "[" || ch === "(") d++;
    else if (ch === "}" || ch === "]" || ch === ")") d--;
    if (ch === "," && d === 0) {
      сбросить(cur);
      cur = "";
    } else cur += ch;
  }
  сбросить(cur);
  return { тест: out, объявлены };
}

/** Секции, которые есть у темы (из собранного манифеста). */
function секцииТемы(тема: string): string[] {
  const p = resolve(
    SITES_ROOT,
    "dist",
    "theme-sections",
    тема,
    "manifest.json",
  );
  if (!existsSync(p)) return [];
  return Object.keys(JSON.parse(readFileSync(p, "utf-8")));
}

function файлПанели(блок: string): string | null {
  const p = resolve(
    SITES_ROOT,
    "packages",
    "theme-base",
    "blocks",
    блок,
    `${блок}.puckConfig.ts`,
  );
  return existsSync(p) ? p : null;
}

type Находка = { тема: string; секция: string; поле: string; тип: string };

/**
 * Живое наполнение секции.
 *
 * ДВА ПРАВИЛА, каждое куплено ложным вердиктом:
 *
 * 1. Текст кладём ТОЛЬКО в поля, объявленные панелью этой секции. Раньше база
 *    вслепую ставила `heading`/`text`/`productId` всем подряд. У «Формы связи»
 *    поля `text` нет вовсе, но порт читает подзаголовок цепочкой
 *    subtitle → text → description: выдуманный `text` перебивал `description`,
 *    и настройка «Текст» выглядела мёртвой, хотя работает. Ровно этот класс —
 *    выдуманные имена пропов — дал половину ложных вердиктов 21.09.
 *
 * 2. Настройка «как показывать» мертва без того, что показывать: «Размер
 *    подзаголовка» ничего не двигает, пока подзаголовок пуст, а «Дата и время» —
 *    пока в секции нет публикаций. Поэтому companion-содержимое (массивы,
 *    картинки, платформенный резолв) задаётся явно.
 */
const КАРТИНКА = "/images/placeholder.png";

/** Структурное содержимое: массивы, картинки, платформенный резолв. */
const СТРУКТУРА: Record<string, Record<string, unknown>> = {
  Hero: {
    image: КАРТИНКА,
    backgroundImages: [КАРТИНКА],
    button: { text: "Кнопка", link: "/catalog" },
  },
  Slideshow: {
    slides: [
      {
        id: "s1",
        heading: { text: "Слайд 1" },
        text: { content: "Текст 1" },
        image: КАРТИНКА,
        button: { text: "К", link: "/a" },
      },
      {
        id: "s2",
        heading: { text: "Слайд 2" },
        text: { content: "Текст 2" },
        image: КАРТИНКА,
        button: { text: "К", link: "/b" },
      },
    ],
  },
  MultiColumns: {
    columns: [
      {
        id: "c1",
        heading: "Колонка 1",
        text: "Текст 1",
        linkText: "Ссылка",
        link: "/a",
        image: КАРТИНКА,
      },
      {
        id: "c2",
        heading: "Колонка 2",
        text: "Текст 2",
        linkText: "Ссылка",
        link: "/b",
        image: КАРТИНКА,
      },
    ],
  },
  MultiRows: {
    rows: [
      {
        id: "r1",
        heading: "Ряд 1",
        text: "Текст 1",
        image: КАРТИНКА,
        button: { text: "Кнопка", link: "/a" },
      },
      {
        id: "r2",
        heading: "Ряд 2",
        text: "Текст 2",
        image: КАРТИНКА,
        button: { text: "Кнопка", link: "/b" },
      },
    ],
  },
  Gallery: {
    items: [
      { id: "g1", image: КАРТИНКА, text: "Подпись 1" },
      { id: "g2", image: КАРТИНКА, text: "Подпись 2" },
    ],
  },
  CollapsibleSection: {
    items: [{ id: "i1", heading: "Вопрос", text: "Ответ" }],
  },
  ImageWithText: { image: КАРТИНКА, button: { text: "Кнопка", link: "/a" } },
  Video: { videoUrl: "https://example.com/v.mp4", poster: КАРТИНКА },
  // Рассылка в подвале по канону ВЫКЛЮЧЕНА (Footer.puckConfig defaults:
  // newsletter.enabled=false), и vanilla честно её не рисует. Без явного
  // включения её «Заголовок» и «Текст» двигали то, чего нет на странице.
  Footer: { newsletter: { enabled: true } },
  Product: { productId: "p1" },
  PopularProducts: { productIds: ["p1", "p2", "p3"] },
  Catalog: { collectionId: "c1" },
  Collections: {
    collections: [
      {
        id: "col-1",
        collectionId: "c1",
        heading: "Коллекция 1",
        description: "Описание 1",
        image: КАРТИНКА,
      },
      {
        id: "col-2",
        collectionId: "c2",
        heading: "Коллекция 2",
        description: "Описание 2",
        image: КАРТИНКА,
      },
    ],
  },
};

/**
 * Каталог магазина. Передаётся ОТДЕЛЬНО от пропов, потому что живая цепочка
 * рендера собирает `__merfy.resolved` сама (resolveBlockProps) и подсунутый в
 * пропах `__merfy` затирается — проверено рендером: секция публикаций рисовала
 * болванку «Публикация», и «Дата и время» выглядела мёртвой в 4 темах.
 */
const КАТАЛОГ = {
  products: [
    {
      id: "p1",
      name: "Товар 1",
      slug: "t1",
      price: 1990,
      compareAtPrice: 2490,
      images: [КАРТИНКА],
      collections: [{ id: "c1" }],
    },
    {
      id: "p2",
      name: "Товар 2",
      slug: "t2",
      price: 2990,
      images: [КАРТИНКА],
      collections: [{ id: "c1" }],
    },
    {
      id: "p3",
      name: "Товар 3",
      slug: "t3",
      price: 3990,
      images: [КАРТИНКА],
      collections: [{ id: "c2" }],
    },
  ],
  collections: [
    { id: "c1", name: "Коллекция 1", slug: "kollekciya-1", image: КАРТИНКА },
    { id: "c2", name: "Коллекция 2", slug: "kollekciya-2", image: КАРТИНКА },
  ],
  publications: [
    {
      id: "pub1",
      title: "Публикация 1",
      slug: "pub-1",
      category: "blog",
      excerpt: "Анонс 1",
      coverImageUrl: КАРТИНКА,
      publishedAt: "2026-03-14T10:00:00.000Z",
    },
    {
      id: "pub2",
      title: "Публикация 2",
      slug: "pub-2",
      category: "blog",
      excerpt: "Анонс 2",
      coverImageUrl: КАРТИНКА,
      publishedAt: "2026-04-01T12:30:00.000Z",
    },
    {
      id: "pub3",
      title: "Публикация 3",
      slug: "pub-3",
      category: "blog",
      excerpt: "Анонс 3",
      coverImageUrl: КАРТИНКА,
      publishedAt: "2026-05-20T08:15:00.000Z",
    },
  ],
};

/** Текст для объявленного панелью поля — по его имени, чтобы был осмысленным. */
function текстПоля(имя: string): string {
  const словарь: Record<string, string> = {
    heading: "Заголовок секции",
    subheading: "Надзаголовок",
    subtitle: "Подзаголовок секции",
    description: "Описание секции",
    text: "Текст секции",
    buttonText: "Кнопка",
    buttonLink: "/catalog",
    link: "/catalog",
    label: "Подпись",
    placeholder: "Введите значение",
    primaryButton: "Кнопка",
    secondaryButton: "Вторая кнопка",
    cta: "Кнопка",
    button: "Кнопка",
  };
  return словарь[имя] ?? `Значение ${имя}`;
}

const ТЕКСТОВЫЕ = new Set(["text", "textarea", "aiText"]);

/**
 * Содержимое составного поля — по его СОБСТВЕННОМУ объявлению `objectFields`.
 *
 * У Hero заголовок и текст объявлены не строками, а объектами
 * ({ text, size } / { content, size }), и автозаполнение по типу их не видело:
 * секция рендерилась вовсе без текста, а «Позиция», «Выравнивание» и
 * «Контейнер» позиционировали пустоту и выглядели мёртвыми втроём разом.
 * Имена вложенных полей читаются из панели — выдумывать их нельзя, на этом
 * уже сгорели ручные замеры.
 */
function содержимоеОбъекта(
  тело: string,
  имя: string,
): Record<string, unknown> | null {
  const i = тело.indexOf("objectFields:");
  if (i < 0) return null;
  const j = тело.indexOf("{", i);
  if (j < 0) return null;
  let d = 1;
  let k = j + 1;
  let внутри = "";
  while (k < тело.length && d > 0) {
    const c = тело[k];
    if (c === "{") d++;
    else if (c === "}") d--;
    if (d > 0) внутри += c;
    k++;
  }
  const out: Record<string, unknown> = {};
  let гл = 0;
  let cur = "";
  const взять = (txt: string) => {
    const km = txt.match(/^[\s\n]*\[?'?([a-zA-Z_]\w*)'?/);
    const tm = txt.match(/type:\s*'([^']+)'/);
    if (!km || !tm) return;
    if (ТЕКСТОВЫЕ.has(tm[1]))
      out[km[1]] = текстПоля(
        km[1] === "text" || km[1] === "content" ? имя : km[1],
      );
  };
  for (const ch of внутри) {
    if (ch === "{" || ch === "[" || ch === "(") гл++;
    else if (ch === "}" || ch === "]" || ch === ")") гл--;
    if (ch === "," && гл === 0) {
      взять(cur);
      cur = "";
    } else cur += ch;
  }
  взять(cur);
  return Object.keys(out).length ? out : null;
}

/**
 * Тестируемые ПОДполя составного поля — из его же `objectFields`.
 *
 * Настройки под-панели («Основной текст ▸ Заголовок», «Текст» подписки, кегль
 * заголовка у каждой секции) живут внутри объекта, и проверка их не видела: тип
 * `object` стоял в списке пропуска целиком. Ровно там сидят пункты 6 и 8 из
 * пачки тестера 22.09 — дыра была в самой проверке, а не в темах.
 */
function подполяОбъекта(тело: string): Record<string, Поле> {
  const i = тело.indexOf("objectFields:");
  if (i < 0) return {};
  const j = тело.indexOf("{", i);
  if (j < 0) return {};
  let d = 1;
  let k = j + 1;
  let внутри = "";
  while (k < тело.length && d > 0) {
    const c = тело[k];
    if (c === "{") d++;
    else if (c === "}") d--;
    if (d > 0) внутри += c;
    k++;
  }
  const out: Record<string, Поле> = {};
  let гл = 0;
  let cur = "";
  const взять = (txt: string) => {
    const km = txt.match(/^[\s\n]*\[?'?([a-zA-Z_]\w*)'?/);
    const tm = txt.match(/type:\s*'([^']+)'/);
    if (!km || !tm) return;
    const f: Record<string, unknown> = { type: tm[1] };
    const opts = [...txt.matchAll(/value:\s*'([^']*)'/g)].map((m) => ({
      value: m[1],
    }));
    if (opts.length) f.options = opts;
    const min = txt.match(/min:\s*(-?\d+)/);
    const max = txt.match(/max:\s*(-?\d+)/);
    if (min) f.min = Number(min[1]);
    if (max) f.max = Number(max[1]);
    const знач = значенияПоля(f);
    if (знач) out[km[1]] = { тип: tm[1], значения: знач };
  };
  for (const ch of внутри) {
    if (ch === "{" || ch === "[" || ch === "(") гл++;
    else if (ch === "}" || ch === "]" || ch === ")") гл--;
    if (ch === "," && гл === 0) {
      взять(cur);
      cur = "";
    } else cur += ch;
  }
  взять(cur);
  return out;
}

/** База рендера: структура секции + текст ТОЛЬКО в поля этой панели. */
function наполнение(
  секция: string,
  объявлены: Array<{ имя: string; тип: string; тело: string }>,
): Record<string, unknown> {
  const из_панели: Record<string, unknown> = {};
  for (const { имя, тип, тело } of объявлены) {
    if (ТЕКСТОВЫЕ.has(тип)) {
      из_панели[имя] = текстПоля(имя);
    } else if (тип === "object") {
      const вложенное = содержимоеОбъекта(тело, имя);
      if (вложенное) из_панели[имя] = вложенное;
    }
  }
  return { ...из_панели, ...(СТРУКТУРА[секция] ?? {}) };
}

const аргументы = process.argv.slice(2);
const темыДляПрогона = (() => {
  const i = аргументы.indexOf("--theme");
  return i >= 0 ? [аргументы[i + 1]] : [...ТЕМЫ];
})();

const мёртвые: Находка[] = [];
const проверено: Находка[] = [];
const упало: Array<Находка & { причина: string }> = [];

/**
 * Рендер идёт ОДНИМ прогоном на тему, а не процессом на каждый замер.
 *
 * Каждый вызов renderBlock поднимает отдельный node: на 478 полей это под
 * тысячу холодных стартов, и проверка стала самым длинным сегментом CI
 * (7 мин 38 с против 2 мин у соседних). renderSections принимает список
 * заданий — собираем все пары значений темы и просим разом.
 */
type Замер = {
  поле: string;
  тип: string;
  секция: string;
  пропсA: Record<string, unknown>;
  пропсB: Record<string, unknown>;
};

for (const тема of темыДляПрогона) {
  const замеры: Замер[] = [];
  for (const секция of секцииТемы(тема)) {
    const панель = файлПанели(секция);
    if (!панель) continue;
    const { тест, объявлены } = поляБлока(панель);
    // Секция БЕЗ содержимого рисует плейсхолдер, а в нём половина настроек
    // не применяется — и аудит объявил бы их мёртвыми. Ровно на этом сорвались
    // ручные замеры 21.09, поэтому каждой секции даётся живое наполнение.
    const содержимое = наполнение(секция, объявлены);
    const база = { id: `${секция}-1`, colorScheme: "scheme-1", ...содержимое };

    for (const [поле, { тип, значения }] of Object.entries(тест)) {
      замеры.push({
        секция,
        поле,
        тип,
        пропсA: { ...база, [поле]: значения[0] },
        пропсB: { ...база, [поле]: значения[1] },
      });
    }

    // Под-панели: «Заголовок ▸ Размер», «Текст ▸ Размер» и прочее внутри
    // составных полей. Базовое значение объекта берём из наполнения, чтобы
    // менялось ровно одно подполе.
    for (const { имя, тип, тело } of объявлены) {
      if (тип !== "object") continue;
      const базовыйОбъект = (содержимое[имя] ?? {}) as Record<string, unknown>;
      for (const [подполе, { тип: птип, значения }] of Object.entries(
        подполяОбъекта(тело),
      )) {
        замеры.push({
          секция,
          поле: `${имя}.${подполе}`,
          тип: птип,
          пропсA: {
            ...база,
            [имя]: { ...базовыйОбъект, [подполе]: значения[0] },
          },
          пропсB: {
            ...база,
            [имя]: { ...базовыйОбъект, [подполе]: значения[1] },
          },
        });
      }
    }
  }

  const задания = замеры.flatMap((з) => [
    { block: з.секция, props: з.пропсA, catalog: КАТАЛОГ },
    { block: з.секция, props: з.пропсB, catalog: КАТАЛОГ },
  ]);
  const результаты = задания.length ? renderSections(тема, задания) : [];

  замеры.forEach((з, i) => {
    const A = результаты[i * 2];
    const B = результаты[i * 2 + 1];
    const общая = { тема, секция: з.секция, поле: з.поле, тип: з.тип };
    if (!A?.html || !B?.html) {
      упало.push({
        ...общая,
        причина: (A?.error ?? B?.error ?? "нет HTML").slice(0, 60),
      });
      return;
    }
    проверено.push(общая);
    if (A.html === B.html) мёртвые.push(общая);
  });
}

console.log(`проверено полей: ${проверено.length}`);
console.log(`не влияют на разметку: ${мёртвые.length}`);
console.log(`не удалось отрендерить: ${упало.length}`);
for (const м of мёртвые.slice(0, 40)) {
  console.log(
    `  ❌ ${м.тема.padEnd(8)} ${м.секция.padEnd(20)} ${м.поле.padEnd(22)} (${м.тип})`,
  );
}

const j = аргументы.indexOf("--json");
if (j >= 0) {
  writeFileSync(
    аргументы[j + 1],
    JSON.stringify({ проверено: проверено.length, мёртвые, упало }, null, 2),
    "utf-8",
  );
  console.log(`отчёт: ${аргументы[j + 1]}`);
}
