/**
 * Свечение на границе «Изображение» ↔ «Список коллекций» во flux.
 *
 * Баг тестировщика 2026-09-14: «Flux. Баг свечение. Это не привязано нигде, в
 * макете такая фотка, в конструкторе сейчас это секция Список коллекций.
 * Ожидаемый результат: убрать свечение». На главной чёрное полотно героя к
 * нижней кромке расплывалось в светло-серый ореол, и сразу под ним начинался
 * «Список коллекций».
 *
 * Что это было. Порт flux `themes/flux/src/components/sections/Hero.astro` нёс
 * дословно перенесённый из вёрстки слой-вуаль
 *   <div class="pointer-events-none absolute inset-0 z-[1]
 *               bg-gradient-to-b from-transparent from-[85%] to-white">
 * (у верстальщиков — Figma 2060:9676). Замер в браузере на реальном CSS темы:
 *   background-image: linear-gradient(in oklab, rgba(0,0,0,0) 85%, rgb(255,255,255) 100%)
 *   --tw-gradient-from-position: 85%   --tw-gradient-to: rgb(255,255,255)
 *   inset-0 → слой на ВСЁ полотно героя (1440×608), z-index 1
 * то есть нижние 15 % высоты героя (≈91 px) гасились в чистый белый. Пиксели по
 * центру полотна (чёрное фото): 84 % → rgb(0,0,0), 86 % → rgb(19,19,19),
 * 90 % → rgb(86,86,86), 94 % → rgb(155,155,155), 97 % → rgb(206,206,206),
 * 99,5 % → rgb(248,248,248). Ровно этот разгон тестировщик и назвал свечением.
 *
 * Почему приём нельзя было оставлять. У верстальщиков вуаль дорисовывала ОДНО
 * конкретное фото (наушники на белом) — растворение было частью картинки. У
 * мерчанта фото произвольное, вуаль от него не зависит и ни одной настройкой не
 * управляется («это не привязано нигде»), поэтому на любом тёмном фото она
 * висит сама по себе грязным ореолом.
 *
 * Что сторожим. Ни один слой секции «Изображение» и секции «Список коллекций»
 * темы flux не создаёт вуали — НИ ОДНИМ механизмом: ни градиентом
 * (linear/radial/conic), ни тенью (box-shadow), ни размытием (filter: blur,
 * backdrop-filter), ни маской (mask-image). Проверка идёт по СЛЕДСТВИЮ —
 * декларации, которая доедет до браузера, — а не по имени класса: вернуть
 * эффект другим классом, инлайн-стилем или псевдоэлементом тест не даст.
 *
 * Обе секции разом, потому что тестировщик указал на «Список коллекций», а
 * эффект принадлежал соседнему герою: гард не должен зависеть от того, на чьей
 * стороне границы окажется следующая вуаль.
 *
 * На сегодня обе секции чисты полностью (замер 2026-09-14: ноль вуалей во всех
 * состояниях), поэтому запрет сплошной, а не «только у кромки» — так его не
 * обойти, сдвинув слой на пару пикселей. Понадобится осознанная вуаль —
 * менять придётся этот файл, а не молча разметку.
 *
 * Как рендерим. Той же цепочкой, что витрина и превью конструктора:
 * props → adaptLegacyProps → blockDefaults темы → resolveBlockProps →
 * СКОМПИЛИРОВАННЫЙ модуль порта темы (dist/theme-sections/flux/manifest.json).
 * CSS берём настоящий — dist/theme-css/flux.css, тот же, что уходит на сайт.
 *
 * Требует сборки (тот же порядок, что в CI):
 *   pnpm build                     — dist/src (adaptLegacyProps, resolveBlockProps);
 *   pnpm build:theme-sections flux — порт секций темы + dist/theme-css/flux.css.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEME = "flux";

/** 1×1 png — чтобы у героя была ветка «фото задано», в которой и жила вуаль. */
const PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAHkirPdAAAAAElFTkSuQmCC";

type Job = { block: string; live: true; props: Record<string, unknown> };

/**
 * Состояния секций, в которых ищем вуаль. Герой берём во всех трёх ветках
 * рендера: одиночное фото (там и была вуаль), пара фото и пустая секция —
 * иначе эффект достаточно вернуть в соседнюю ветку, и тест промолчит.
 */
const CASES: { name: string; job: Job }[] = [
  {
    name: "«Изображение»: одно фото",
    job: {
      block: "Hero",
      live: true,
      props: {
        id: "Hero-1",
        backgroundImage: PHOTO,
        heading: { text: "Заголовок" },
        text: { content: "Текст" },
        primaryButton: { text: "Кнопка", link: "/catalog" },
      },
    },
  },
  {
    name: "«Изображение»: пара фото",
    job: {
      block: "Hero",
      live: true,
      props: {
        id: "Hero-2",
        backgroundImages: { url1: PHOTO, url2: PHOTO },
        heading: { text: "Заголовок" },
      },
    },
  },
  {
    name: "«Изображение»: пустая секция",
    job: { block: "Hero", live: true, props: { id: "Hero-3" } },
  },
  {
    name: "«Список коллекций»",
    job: {
      block: "Collections",
      live: true,
      props: {
        id: "Collections-1",
        heading: "КАТЕГОРИИ",
        description: "Выберите интересующую категорию",
        collections: [
          { id: "c1", collectionId: null, heading: "Коллекция" },
          { id: "c2", collectionId: null, heading: "Коллекция" },
          { id: "c3", collectionId: null, heading: "Коллекция" },
        ],
        columns: 3,
      },
    },
  },
];

/**
 * Декларации-вуали. Именно ДЕКЛАРАЦИИ: важно, что доедет до браузера, а не
 * каким классом это записали. `filter` отделён от `backdrop-filter`, `none`
 * не считается эффектом.
 */
const VEILS: { name: string; re: RegExp }[] = [
  {
    name: "градиент",
    re: /background(?:-image)?\s*:[^;}]*(?:linear|radial|conic)-gradient/i,
  },
  { name: "тень", re: /box-shadow\s*:\s*(?!none\b)[^;}]+/i },
  { name: "размытие", re: /(?<!backdrop-)filter\s*:[^;}]*blur\s*\(/i },
  {
    name: "размытие подложки",
    re: /backdrop-filter\s*:\s*(?!none\b)[^;}]+/i,
  },
  {
    name: "маска",
    re: /(?:-webkit-)?mask-image\s*:\s*(?!none\b)[^;}]+/i,
  },
];

const veilsIn = (text: string): string[] =>
  VEILS.filter((v) => v.re.test(text)).map((v) => v.name);

/**
 * Второй, независимый от собранного CSS источник: САМО ИМЯ утилиты tailwind.
 *
 * Зачем он. Правила вроде `.bg-gradient-to-b` попадают в `dist/theme-css` только
 * пока такой класс есть хоть где-то в исходниках темы — снимаем вуаль, и правило
 * из CSS исчезает. Опираться на один лишь CSS значит держать сторож, чью
 * чувствительность чинит и ломает посторонняя правка в соседнем файле. Поэтому
 * имя класса считается уликой само по себе: вернуть градиент утилитой tailwind
 * тест не даст даже на CSS, где такого правила ещё нет.
 */
const VEIL_CLASSES: { name: string; re: RegExp }[] = [
  {
    name: "градиент",
    re: /^(?:bg-(?:gradient-to-|linear-|radial|conic)|from-|via-|to-)/,
  },
  { name: "тень", re: /^(?:drop-)?shadow(?:-(?!none$).+)?$/ },
  { name: "размытие", re: /^(?:backdrop-)?blur(?:-(?!none$).+)?$/ },
  { name: "маска", re: /^mask-(?!none$)/ },
];

const veilsInClass = (cls: string): string[] =>
  VEIL_CLASSES.filter((v) => v.re.test(cls)).map((v) => `${v.name} (утилита ${cls})`);

/**
 * CSS темы → плоские правила «селектор → тело». Вложенность @media/@layer
 * намеренно теряется: вуаль, включённая только на одном вьюпорте, — та же
 * вуаль. Обратные слэши tailwind-экранирования снимаются, чтобы класс
 * `from-[85%]` искался как написан в разметке.
 */
function themeRules(): { sel: string; body: string }[] {
  const path = resolve(SITES_ROOT, "dist", "theme-css", `${THEME}.css`);
  if (!existsSync(path)) {
    throw new Error(`нет ${path} — нужен pnpm build:theme-sections ${THEME}`);
  }
  const css = readFileSync(path, "utf8").replace(/\\/g, "");
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    sel: m[1].trim(),
    body: m[2],
  }));
}

/** Класс → правила темы, где он участвует (включая `.cls::after` и т. п.). */
function indexByClass(): Map<string, { sel: string; body: string }[]> {
  const out = new Map<string, { sel: string; body: string }[]>();
  for (const rule of themeRules()) {
    for (const m of rule.sel.matchAll(/\.([^\s.,>+~:[\]()#{}]+)/g)) {
      const list = out.get(m[1]) ?? [];
      list.push(rule);
      out.set(m[1], list);
    }
  }
  return out;
}

function renderAll(): Map<string, string> {
  const raw = execFileSync(
    "node",
    [RENDERER, THEME, JSON.stringify(CASES.map((c) => c.job))],
    { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  );
  const rows = JSON.parse(raw) as {
    block: string;
    html?: string;
    missing?: boolean;
    error?: string;
  }[];
  const out = new Map<string, string>();
  rows.forEach((r, i) => {
    const name = CASES[i].name;
    if (r.missing) throw new Error(`${name}: в теме ${THEME} нет блока ${r.block}`);
    if (r.error) throw new Error(`${name}: ошибка рендера — ${r.error}`);
    out.set(name, r.html ?? "");
  });
  return out;
}

/** Слои-вуали внутри отрендеренной секции: тег, классы и чем именно вуалит. */
function veilLayers(
  html: string,
  byClass: Map<string, { sel: string; body: string }[]>,
): string[] {
  const found: string[] = [];
  for (const tag of html.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
    const attrs = tag[2];
    const classes = (/class="([^"]*)"/.exec(attrs)?.[1] ?? "")
      .split(/\s+/)
      .filter(Boolean);
    const inline = /style="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const why = new Set<string>();
    for (const name of veilsIn(inline)) why.add(`${name} (инлайн-стиль)`);
    for (const cls of classes) {
      for (const name of veilsInClass(cls)) why.add(name);
      for (const rule of byClass.get(cls) ?? []) {
        for (const name of veilsIn(rule.body)) why.add(`${name} ← ${rule.sel}`);
      }
    }
    if (why.size) {
      found.push(
        `<${tag[1]} class="${classes.join(" ")}"> → ${[...why].join("; ")}`,
      );
    }
  }
  return found;
}

describe(`${THEME}: граница «Изображение» ↔ «Список коллекций» — без вуали`, () => {
  const dist = resolve(
    SITES_ROOT,
    "dist",
    "theme-sections",
    THEME,
    "manifest.json",
  );
  if (!existsSync(dist)) {
    it(`секции ${THEME} не собраны`, () => {
      throw new Error(
        `нет ${dist} — нужен pnpm build && pnpm build:theme-sections ${THEME}`,
      );
    });
    return;
  }

  const byClass = indexByClass();
  const rendered = renderAll();

  it.each(CASES.map((c) => c.name))("%s: слоёв-вуалей нет", (name) => {
    const layers = veilLayers(rendered.get(name) ?? "", byClass);
    expect(layers).toEqual([]);
  });

  it("контроль: детектор ловит вуаль по имени утилиты", () => {
    // Без этих проверок «вуалей нет» было бы зелёным и при сломанном детекторе
    // (съехал парсер разметки, разъехались регулярки) — то есть не значило бы
    // ничего. Ровно тот слой, который был снят из порта:
    const snyato = `<div class="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-transparent from-[85%] to-white"></div>`;
    expect(veilLayers(snyato, byClass)).toHaveLength(1);
    expect(veilLayers(`<div class="shadow-2xl"></div>`, byClass)).toHaveLength(1);
    expect(veilLayers(`<div class="backdrop-blur-sm"></div>`, byClass)).toHaveLength(1);
    expect(veilLayers(`<div class="mask-b-from-80%"></div>`, byClass)).toHaveLength(1);
  });

  it("контроль: детектор ловит вуаль инлайн-стилем", () => {
    // Обход «напишу не классом, а руками» обязан ловиться тем же гардом.
    for (const style of [
      "background-image:linear-gradient(to bottom,transparent 85%,#fff)",
      "background:radial-gradient(#fff,transparent)",
      "box-shadow:0 -80px 60px #fff",
      "filter:blur(40px)",
      "backdrop-filter:blur(8px)",
      "mask-image:linear-gradient(#000,transparent)",
    ]) {
      expect(veilLayers(`<div style="${style}"></div>`, byClass)).toHaveLength(1);
    }
  });

  it("контроль: детектор ловит вуаль правилом CSS темы", () => {
    // Третий путь обхода — класс без «говорящего» имени, за которым в CSS темы
    // стоит вуаль. Класс-улику берём из САМОГО собранного CSS, а не из списка в
    // тесте: список бы устарел молча.
    const carrier = [...byClass.entries()].find(
      ([cls, rules]) =>
        !VEIL_CLASSES.some((v) => v.re.test(cls)) &&
        rules.some((r) => veilsIn(r.body).length > 0),
    );
    expect(carrier).toBeDefined();
    const [cls] = carrier!;
    expect(veilLayers(`<div class="${cls}"></div>`, byClass)).toHaveLength(1);
  });

  it("контроль: детектор не срабатывает на пустом месте", () => {
    // Затемняющий оверлей настройки «Прозрачность» — обычный цвет, не вуаль:
    // сторож не должен запрещать то, чем управляет мерчант.
    expect(veilLayers(`<div class="absolute inset-0 bg-black" style="opacity:0.4"></div>`, byClass))
      .toEqual([]);
    expect(veilLayers(`<section class="relative w-full overflow-hidden"></section>`, byClass))
      .toEqual([]);
  });
});
