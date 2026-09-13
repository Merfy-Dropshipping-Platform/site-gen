/**
 * «Глаз» у ЭЛЕМЕНТА СПИСКА обязан убирать его с витрины — во всех пяти темах
 * и у каждого блока со списком, который конструктор адресует.
 *
 * Это ВТОРОЙ механизм скрытия, не тот, что сторожит `hidden-named-fields.spec`:
 *   • именованный параметр  → `props.hiddenFields: ['heading']`  → прячет ПОРТ темы;
 *   • элемент списка        → `props.<array>[i].hidden === true`  → отбрасывает
 *     общий `dropHiddenArrayItems` в `src/themes/page-blocks.ts`.
 *
 * Почему гард появился. Баг-репорт тестировщика 2026-09-13: «скрытие
 * параметров не работает — в сайдбаре скрыто, в магазине видно» у «Товара»,
 * «Мультирядов», «Мультиколонн», «Слайд-шоу» и «Сворачиваемого раздела».
 * Четыре из пяти — списки, и отсев скрытых элементов был написан руками ровно
 * у ДВУХ блоков («Список коллекций» и «Галерея»). Соседний гард считал эти
 * блоки «функциональности нет» и в проверку не брал — дыра была там, куда
 * никто не смотрел.
 *
 * Что считаем. УЗЛЫ, а не наличие строки: у каждого элемента свой уникальный
 * маячок, и он обязан исчезнуть ПОЛНОСТЬЮ (0 вхождений), а соседние — остаться
 * в том же количестве. Контрольная колонка обязательна: правка, уносящая всю
 * секцию, тоже «убирает» скрытый элемент, и без соседей выглядела бы зелёной.
 *
 * Как рендерим. Тем же путём, что живой конструктор и сборка витрины:
 *   props → adaptLegacyProps → resolveBlockProps → скомпилированный модуль
 *   порта темы (dist/theme-sections/<тема>/manifest.json).
 * `resolveBlockProps` обязателен: satin Collections читает плитки не из
 * props.collections, а из `__merfy.resolved.collectionTiles` — без этого шага
 * порт рисовал бы заглушки и проверка ничего бы не значила.
 *
 * Список блоков со списком берётся из РАБОЧЕГО puckConfig темы (первое поле
 * типа array — ровно то, что выбирает `findArrayField` конструктора), поэтому
 * новый блок со списком попадает под проверку сам. Блок, у которого список
 * есть, но нет ни реквизита для рендера, ни явной причины-исключения, роняет
 * тест — молчаливый пропуск невозможен.
 *
 * Требует сборки (тот же порядок, что в CI):
 *   pnpm build                     — dist/src (adaptLegacyProps, resolveBlockProps,
 *                                    контроллер puck-config);
 *   pnpm build:theme-sections:all  — порты секций всех пяти тем.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const PUCK_FIELDS = resolve(__dirname, "puck-config-fields.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Сколько элементов кладём в список: один скрываем, два — контрольные. */
const ITEM_COUNT = 3;
/** Уникальный маячок элемента. Заглавные буквы: часть портов режет регистр. */
const mk = (n: number) => `MKITEM${n}`;

type ItemBuilder = (n: number) => Record<string, unknown>;

/**
 * Реквизит элемента для каждого блока со списком.
 *
 * Ключи полей разные у разных портов (title/heading, text/description/content,
 * url/image), поэтому кладём все известные синонимы — маячок один и тот же, и
 * неважно, какой ключ прочитает конкретная тема.
 */
const LIST_ITEMS: Record<string, ItemBuilder> = {
  Collections: (n) => ({
    id: `col-slot-${n}`,
    collectionId: `col-${n}`,
    heading: mk(n),
    name: mk(n),
    image: `/${mk(n)}.png`,
  }),
  Gallery: (n) => ({
    id: `gal-${n}`,
    type: "image",
    url: `/${mk(n)}.png`,
    image: `/${mk(n)}.png`,
  }),
  Slideshow: (n) => ({
    id: `slide-${n}`,
    heading: { text: mk(n) },
    text: { content: `${mk(n)}-text` },
    image: `/${mk(n)}.png`,
  }),
  MultiColumns: (n) => ({
    id: `column-${n}`,
    title: mk(n),
    heading: mk(n),
    description: `${mk(n)}-text`,
    text: `${mk(n)}-text`,
  }),
  MultiRows: (n) => ({
    id: `row-${n}`,
    title: mk(n),
    heading: mk(n),
    description: `${mk(n)}-text`,
    text: `${mk(n)}-text`,
    image: `/${mk(n)}.png`,
  }),
  CollapsibleSection: (n) => ({
    id: `fold-${n}`,
    title: mk(n),
    heading: mk(n),
    content: `${mk(n)}-text`,
    text: `${mk(n)}-text`,
  }),
  Header: (n) => ({
    id: `nav-${n}`,
    label: mk(n),
    text: mk(n),
    href: `/${mk(n)}`,
    link: `/${mk(n)}`,
  }),
};

/** Пропсы секции (не элементов) — минимум, чтобы порт дошёл до списка. */
const BLOCK_PROPS: Record<string, Record<string, unknown>> = {
  Header: { logoText: "MKLOGO" },
};

/**
 * Блоки, у которых array-поле в конфиге ЕСТЬ, а списка на витрине нет.
 * Причина обязана быть видна в диффе — молчаливое исключение и есть тот способ,
 * которым баг прожил месяцы.
 */
const NO_LIST_ON_STOREFRONT: Record<string, Record<string, string>> = {
  bloom: {
    Collections:
      "порт bloom рисует не плитки коллекций, а сетку ТОВАРОВ одной коллекции: " +
      "props.collections даёт единственный collectionId-ссылку, отдельных элементов на витрине нет",
  },
};

type Job = {
  block: string;
  props: Record<string, unknown>;
  pkg?: "theme-base";
  /** Прогнать props через рабочую нормализацию рантайма (см. рендерер). */
  pipeline?: true;
};
type Row = {
  block: string;
  html?: string;
  missing?: boolean;
  error?: string;
  /** dist/src не поднялся — рендер шёл бы мимо реального пайплайна. */
  pipelineError?: string;
};

function render(theme: string, jobs: Job[]): Row[] {
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(raw) as Row[];
}

/**
 * Блок → ПЕРВОЕ array-поле его рабочего конфига. Дочерний процесс: конфиг
 * тянет ESM-модули блоков, jest их не грузит. null — конфиг недоступен (не
 * собран `pnpm build`); это ловит отдельный тест, иначе список блоков молча
 * стал бы пустым и проверки исчезли бы вместе с ним.
 */
function runtimeArrayFields(theme: string): Record<string, string> | null {
  try {
    const raw = execFileSync("node", [PUCK_FIELDS, theme, "--arrays"], {
      cwd: SITES_ROOT,
      encoding: "utf-8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }
}

function manifestBlocks(theme: string): string[] | null {
  const mf = resolve(
    SITES_ROOT,
    "dist",
    "theme-sections",
    theme,
    "manifest.json",
  );
  if (!existsSync(mf)) return null;
  return Object.keys(
    JSON.parse(readFileSync(mf, "utf-8")) as Record<string, string>,
  );
}

/** Сколько раз маячок элемента виден в разметке. */
const hits = (html: string, probe: string): number =>
  html.split(probe).length - 1;

describe.each(THEMES)("скрытие элемента списка — %s", (theme) => {
  const blocks = manifestBlocks(theme);
  const arrayFields = runtimeArrayFields(theme);
  const built = blocks !== null && arrayFields !== null;

  /** Блоки этой темы, у которых конструктор показывает список с «глазом». */
  const listBlocks = built
    ? Object.keys(arrayFields)
        .filter((b) => blocks.includes(b))
        .sort()
    : [];
  const excluded = NO_LIST_ON_STOREFRONT[theme] ?? {};
  const checked = listBlocks.filter((b) => !(b in excluded));

  let shown: Row[] = [];
  let hidden: Row[] = [];

  const buildProps = (block: string, hideFirst: boolean) => {
    const arr = (arrayFields as Record<string, string>)[block];
    const make = LIST_ITEMS[block];
    const items = Array.from({ length: ITEM_COUNT }, (_, i) => {
      const item = make(i + 1);
      return hideFirst && i === 0 ? { ...item, hidden: true } : item;
    });
    return {
      colorScheme: 1,
      padding: { top: 40, bottom: 40 },
      id: `${block}-1`,
      heading: "MK_SECTION_HEAD",
      title: "MK_SECTION_HEAD",
      ...(BLOCK_PROPS[block] ?? {}),
      [arr]: items,
    };
  };

  beforeAll(() => {
    if (!built || checked.length === 0) return;
    const withItems = checked.filter((b) => LIST_ITEMS[b]);
    shown = render(
      theme,
      withItems.map((block) => ({
        block,
        props: buildProps(block, false),
        pipeline: true as const,
      })),
    );
    hidden = render(
      theme,
      withItems.map((block) => ({
        block,
        props: buildProps(block, true),
        pipeline: true as const,
      })),
    );
  }, 300_000);

  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(blocks).not.toBeNull();
  });

  it("рабочий puck-config темы прочитан (pnpm build)", () => {
    // Без конфига список блоков со списком пуст и «всё зелено» ничего не значит.
    expect(arrayFields).not.toBeNull();
    expect(Object.keys(arrayFields ?? {}).length).toBeGreaterThan(0);
  });

  it("нормализация пайплайна доступна (pnpm build)", () => {
    if (!built || checked.length === 0) return;
    // Тест обязан гнать props тем же adaptLegacyProps/resolveBlockProps, что
    // и рантайм. Нет dist/src — рендер пошёл бы по сырым props, то есть
    // проверял бы не тот пайплайн; рендерер сообщает об этом явно.
    expect(shown.map((r) => r.pipelineError ?? null).filter(Boolean)).toEqual(
      [],
    );
  });

  it("у темы есть блоки со списком (иначе набор проверок пуст)", () => {
    if (!built) return;
    expect(listBlocks.length).toBeGreaterThan(0);
  });

  it("каждый блок со списком снабжён реквизитом или явным исключением", () => {
    if (!built) return;
    const unclassified = listBlocks.filter(
      (b) => !LIST_ITEMS[b] && !(b in excluded),
    );
    // Блок с array-полем появился в теме — опишите его элемент в LIST_ITEMS
    // либо внесите в NO_LIST_ON_STOREFRONT с причиной.
    expect(unclassified).toEqual([]);
  });

  checked
    .filter((b) => LIST_ITEMS[b])
    .forEach((block, i) => {
      const arr = built ? arrayFields[block] : "";

      it(`${block}: элементы списка вообще рендерятся`, () => {
        if (!built) return;
        const row = shown[i];
        if (row?.missing) return;
        expect(row?.error ?? null).toBeNull();
        const html = row?.html ?? "";
        // Нет ни одного маячка — рендер ничего не доказывает: «скрыт» и «не
        // отрисован вовсе» неразличимы. Либо реквизит неверный, либо у блока
        // списка на витрине нет (тогда его место — в NO_LIST_ON_STOREFRONT).
        expect([1, 2, 3].map((n) => hits(html, mk(n)) > 0)).toEqual([
          true,
          true,
          true,
        ]);
      });

      it(`${block}: скрытый элемент исчезает с витрины`, () => {
        if (!built) return;
        const before = shown[i];
        const after = hidden[i];
        if (before?.missing || after?.missing) return;
        expect(after?.error ?? null).toBeNull();
        if (hits(before?.html ?? "", mk(1)) === 0) return;
        expect(hits(after?.html ?? "", mk(1))).toBe(0);
      });

      it(`${block}: соседние элементы остаются (контрольная колонка)`, () => {
        if (!built) return;
        const before = shown[i]?.html ?? "";
        const after = hidden[i]?.html ?? "";
        if (shown[i]?.missing || hidden[i]?.missing || hidden[i]?.error) return;
        if (hits(before, mk(1)) === 0) return;
        // Правка, уносящая всю секцию, тоже «прячет» элемент — без этой
        // проверки она выглядела бы исправлением.
        //
        // Сравнение «не меньше», а не «ровно столько же»: часть портов рисует
        // ПЕРВЫЙ видимый элемент с доп. разметкой (vanilla Slideshow — активный
        // слайд), и после скрытия первого слайда второй законно прибавляет
        // вхождения. Потеря вхождений — всегда регрессия, прибавка — нет.
        expect({
          второй: hits(after, mk(2)) >= hits(before, mk(2)),
          третий: hits(after, mk(3)) >= hits(before, mk(3)),
        }).toEqual({ второй: true, третий: true });
      });

      it(`${block}: узлов элементов стало ровно на один меньше`, () => {
        if (!built) return;
        const before = shown[i]?.html ?? "";
        const after = hidden[i]?.html ?? "";
        if (shown[i]?.missing || hidden[i]?.missing || hidden[i]?.error) return;
        const node = `data-puck-subsection-field="${arr}"`;
        const n = hits(before, node);
        // Порт не помечает элементы узлом подсекции (Header рисует меню одним
        // блоком) — считать нечего, поведение уже проверено маячками выше.
        if (n < ITEM_COUNT) return;
        expect(hits(after, node)).toBe(n - 1);
      });

      it(`${block}: корень секции переживает скрытие (иначе превью не обновится)`, () => {
        if (!built) return;
        const before = shown[i]?.html ?? "";
        const after = hidden[i]?.html ?? "";
        if (shown[i]?.missing || hidden[i]?.missing || hidden[i]?.error) return;
        const root = `data-puck-component-id="${block}-1"`;
        if (!before.includes(root)) return;
        // Пустой ответ `/preview/block` конструктор отбраковывает и оставляет
        // старый DOM — мерчант видит это как «глаз не работает».
        expect(after).toContain(root);
      });
    });

  Object.entries(excluded).forEach(([block, reason]) => {
    it(`${block}: списка на витрине нет — ${reason}`, () => {
      if (!built) return;
      // Исключение обязано оставаться правдой: блок всё ещё в теме и всё ещё
      // с array-полем в конфиге. Иначе запись протухла и её надо снять.
      expect(listBlocks).toContain(block);
    });
  });
});
