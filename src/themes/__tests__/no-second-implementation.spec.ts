import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Снятый анти-паттерн не возвращается НИ В ОДНУ тему.
 *
 * ЗАЧЕМ. Владелец 22.09: «Я тебе эти задачи кидаю уже пятый раз». Разбор
 * показал одну причину: фича живёт на 7–15 путях (пять тем × секция +
 * гидрация + своя страница + каталожный порт), чинится один, остальные
 * остаются — и тестер находит их по очереди. Примеры этой же сессии:
 *
 *   • подпись варианта в корзине — CartSection починили раньше, CartBody и
 *     СТРАНИЦА корзины bloom/satin остались на склейке color+size;
 *   • выбор варианта «первая доступная» — поправили Popular и гидрацию, а
 *     четыре каталожных порта продолжали класть последний оттенок;
 *   • скругление кнопки покупки было зашито числом мимо токена темы.
 *
 * Поэтому здесь список того, что УЖЕ централизовано, и запрет на прежнюю
 * форму. Новая централизация = новая строка в списке.
 *
 * Гард ищет по КОДУ (комментарии срезаются): пояснения цитируют снятые
 * конструкции, и без среза проверка ловила бы собственные комментарии.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const КОРНИ = ["themes", "packages"];
const ПРОПУСК = [
  "node_modules",
  "/dist/",
  "__snapshots__",
  "/.astro/",
  "/dist-",
];

type Запрет = {
  имя: string;
  шаблон: RegExp;
  вместо: string;
  /** Файлы, где прежняя форма допустима, с причиной. */
  исключения: Array<{ путь: string; почему: string }>;
};

const ЗАПРЕТЫ: Запрет[] = [
  {
    имя: "подпись варианта склейкой color+size",
    шаблон: /\[\s*line\.variant\?\.color\s*,\s*line\.variant\?\.size\s*\]/,
    вместо: "variantLabel / variantPairs из theme-base/runtime/nt-cart",
    исключения: [
      {
        путь: "themes/luna/src/pages/cart.astro",
        почему: "luna вне объёма (AGENTS.md)",
      },
      {
        путь: "themes/bloom/src/lib/nt-cart-bloom.ts",
        почему: "мёртвая копия ядра, импортов нет",
      },
      {
        путь: "themes/satin/src/lib/nt-cart-satin.ts",
        почему: "мёртвая копия ядра, импортов нет",
      },
      {
        путь: "themes/vanilla/src/lib/nt-cart-vanilla.ts",
        почему: "мёртвая копия ядра, импортов нет",
      },
    ],
  },
  {
    имя: "вариант по умолчанию = «первая доступная комбинация»",
    шаблон: /\.find\(\s*\(c\)\s*=>\s*c\s*&&\s*c\.available\s*!==\s*false\s*\)/,
    вместо:
      "pickDefaultCombination (или __merfyPickDefaultCombination в is:inline)",
    // Вычищено везде — исключений нет.
    исключения: [],
  },
  {
    имя: "жёсткое скругление кнопки покупки мимо токена темы",
    шаблон: /class="inline-flex h-14 w-full[^"]*rounded-\[\d+px\]/,
    вместо: "rounded-[var(--radius-button,…)]",
    исключения: [],
  },
  {
    имя: "текст согласия подставляется голым (теги экранируются)",
    шаблон: />\{agreeText\}</,
    вместо: "set:html={inlineFormat(agreeText)}",
    исключения: [],
  },
  {
    имя: "клиентский рантайм блока подключён модульным import",
    шаблон: /<script>\s*\n?\s*import\s+'\.\.\/\.\.\/runtime\//,
    вместо:
      "<script is:inline set:html={…_SOURCE}> — модульный даёт 404 на витрине",
    исключения: [
      {
        путь: "packages/theme-base/blocks/Hero/Hero.astro",
        почему:
          "обычный блок theme-base: его module-script Astro собирает. " +
          "404 даёт module-script в ПОРТАХ тем, которые компилируются is:inline " +
          "(об этом прямо сказано в packages/theme-*/blocks/Catalog/Catalog.astro)",
      },
    ],
  },
];

function файлы(): string[] {
  const out: string[] = [];
  const обход = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const p = resolve(dir, e);
      const rel = p.slice(SITES_ROOT.length + 1);
      if (ПРОПУСК.some((x) => `/${rel}/`.includes(x))) continue;
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) обход(p);
      else if (/\.(astro|ts|tsx)$/.test(e)) out.push(rel);
    }
  };
  for (const к of КОРНИ) обход(resolve(SITES_ROOT, к));
  return out;
}

/** Комментарии — не код: пояснения цитируют снятые конструкции. */
const код = (rel: string): string =>
  readFileSync(resolve(SITES_ROOT, rel), "utf-8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ");

const ВСЕ = файлы();

describe("вторая реализация снятого анти-паттерна", () => {
  it("обход видит темы и пакеты — иначе проверки сторожат пустоту", () => {
    expect(ВСЕ.length).toBeGreaterThan(100);
    expect(ВСЕ.some((f) => f.startsWith("themes/rose/"))).toBe(true);
    expect(ВСЕ.some((f) => f.startsWith("packages/theme-base/"))).toBe(true);
  });

  it.each(ЗАПРЕТЫ.map((з) => [з.имя, з] as const))("%s", (_имя, з) => {
    const разрешено = new Set(з.исключения.map((и) => и.путь));
    const нарушители = ВСЕ.filter(
      (f) => !разрешено.has(f) && з.шаблон.test(код(f)),
    );
    expect({ запрет: з.имя, нарушители, вместо: з.вместо }).toEqual({
      запрет: з.имя,
      нарушители: [],
      вместо: з.вместо,
    });
  });

  it.each(
    ЗАПРЕТЫ.flatMap((з) =>
      з.исключения.map((и) => [`${з.имя} — ${и.путь}`, з, и] as const),
    ),
  )("исключение живо: %s", (_имя, з, и) => {
    // Исключение без нарушения = список протух и начал прятать новое.
    const есть = ВСЕ.includes(и.путь) && з.шаблон.test(код(и.путь));
    expect({ путь: и.путь, почему: и.почему, ещёНужно: есть }).toEqual({
      путь: и.путь,
      почему: и.почему,
      ещёНужно: true,
    });
  });
});

/**
 * Выбор варианта в is:inline портах каталога.
 *
 * Импортировать общий `pickDefaultCombination` туда НЕЛЬЗЯ: блок-порты
 * компилируются в ПЛОСКУЮ `dist/astro-blocks`, и кросс-пакетный относительный
 * путь после сборки не резолвится — артефакт satin переставал грузиться,
 * конформанс ловил это как «renderer недостижим» (22.09).
 *
 * Поэтому текст живёт в каждом порту, и здесь сторожится его ИДЕНТИЧНОСТЬ:
 * разойдутся — проверка красная, то есть вторая реализация всё равно не
 * заводится.
 */
describe("выбор варианта в портах каталога не расходится", () => {
  const ПОРТЫ = ["rose", "bloom", "satin", "flux"].map(
    (t) => `packages/theme-${t}/blocks/Catalog/Catalog.astro`,
  );

  /** Тело общей функции без отступов — сравниваем смысл, а не форматирование. */
  const тело = (rel: string): string => {
    const src = readFileSync(resolve(SITES_ROOT, rel), "utf-8");
    const i = src.indexOf("window.__merfyPickDefaultCombination = function");
    expect({ порт: rel, найдено: i > -1 }).toEqual({
      порт: rel,
      найдено: true,
    });
    const кусок = src.slice(i, src.indexOf("</script>", i));
    return кусок.replace(/\s+/g, " ").trim();
  };

  it("все четыре порта несут одинаковую реализацию", () => {
    const эталон = тело(ПОРТЫ[0]);
    for (const порт of ПОРТЫ.slice(1)) {
      expect({ порт, совпадает: тело(порт) === эталон }).toEqual({
        порт,
        совпадает: true,
      });
    }
  });

  it("каждый порт ЗОВЁТ её, а не только объявляет", () => {
    for (const порт of ПОРТЫ) {
      const src = код(порт);
      expect({
        порт,
        зовёт: src.includes("window.__merfyPickDefaultCombination("),
      }).toEqual({
        порт,
        зовёт: true,
      });
    }
  });
});

/**
 * Шторка «Фильтры и сортировка» на телефоне — одна на все темы (владелец 23.09:
 * «адаптив мобилы взять с вёрстки»; в вёрстке это lib/filters-sheet.ts, один
 * файл на пять тем). Порт-блок не может импортировать общий модуль (см. выше),
 * поэтому скрипт шторки лежит в компоненте каждой темы — и здесь сторожится,
 * что текст ОДИН: починили замок прокрутки в одной теме — чиним во всех.
 */
describe("скрипт шторки фильтров в портах не расходится", () => {
  const ШТОРКИ = [
    ["bloom", "Bloom"],
    ["satin", "Satin"],
    ["flux", "Flux"],
    ["rose", "Rose"],
    ["vanilla", "Vanilla"],
  ].map(([t, N]) => ({
    шторка: `packages/theme-${t}/blocks/Catalog/${N}FiltersSheet.astro`,
    каталог: `packages/theme-${t}/blocks/Catalog/Catalog.astro`,
    имя: `${N}FiltersSheet`,
  }));

  const скрипт = (rel: string): string => {
    const src = readFileSync(resolve(SITES_ROOT, rel), "utf-8");
    const i = src.indexOf("<script is:inline>");
    expect({ файл: rel, найдено: i > -1 }).toEqual({
      файл: rel,
      найдено: true,
    });
    return src
      .slice(i, src.indexOf("</script>", i))
      .replace(/\s+/g, " ")
      .trim();
  };

  it("у всех пяти тем один и тот же текст скрипта", () => {
    const эталон = скрипт(ШТОРКИ[0].шторка);
    for (const { шторка } of ШТОРКИ.slice(1)) {
      expect({ шторка, совпадает: скрипт(шторка) === эталон }).toEqual({
        шторка,
        совпадает: true,
      });
    }
  });

  it("каталог каждой темы оборачивает фильтры своей шторкой", () => {
    for (const { каталог, имя } of ШТОРКИ) {
      const src = код(каталог);
      expect({ каталог, обёртка: src.includes(`<${имя} `) }).toEqual({
        каталог,
        обёртка: true,
      });
    }
  });
});

/**
 * Чипы выбранных фильтров над товарами — один код на пять тем (владелец:
 * «сделай для каждой темы»). Порт не может импортировать общий модуль (см.
 * выше), поэтому подписи, разметка и нажатия чипов лежат отдельным
 * `<script is:inline>` в каталоге каждой темы, и здесь сторожится, что текст
 * ОДИН: поправили подпись или нажатие в одной теме — правим во всех.
 */
describe("чипы фильтров в портах не расходятся", () => {
  const ПОРТЫ = ["rose", "vanilla", "satin", "bloom", "flux"].map(
    (t) => `packages/theme-${t}/blocks/Catalog/Catalog.astro`,
  );

  const тело = (rel: string): string => {
    const src = readFileSync(resolve(SITES_ROOT, rel), "utf-8");
    const i = src.indexOf("window.__merfyFilterChips = (function");
    expect({ порт: rel, найдено: i > -1 }).toEqual({ порт: rel, найдено: true });
    return src
      .slice(i, src.indexOf("</script>", i))
      .replace(/\s+/g, " ")
      .trim();
  };

  it("у всех пяти портов один и тот же текст", () => {
    const эталон = тело(ПОРТЫ[0]);
    for (const порт of ПОРТЫ.slice(1)) {
      expect({ порт, совпадает: тело(порт) === эталон }).toEqual({ порт, совпадает: true });
    }
  });

  it("каждый порт рисует чипы и держит для них место над сеткой в обеих раскладках", () => {
    for (const порт of ПОРТЫ) {
      const src = код(порт);
      expect({
        порт,
        рисует: src.includes("window.__merfyFilterChips.render("),
        мест: (src.match(/<div data-nt="catalog-chips"/g) ?? []).length,
      }).toEqual({ порт, рисует: true, мест: 2 });
    }
  });
});

/**
 * Фильтры по остальным параметрам товара (Размер, Формат, Оттенок…) — один
 * блок у rose, satin, bloom и flux: копия «Цвета» под каждую группу из
 * /api/store/filters. У vanilla своя обвязка выбора (CHOICE), её блок —
 * отдельный. Разойдётся текст у четырёх — проверка красная.
 */
describe("фильтры параметров товара в портах rose-семейства не расходятся", () => {
  const ПОРТЫ = ["rose", "satin", "bloom", "flux"].map((t) => `packages/theme-${t}/blocks/Catalog/Catalog.astro`);
  const НАЧАЛО = "// ─────────── Остальные параметры товара (Размер, Формат, Оттенок…) ───────────";
  const КОНЕЦ = "// ─────────── Цвет (data-driven; нет данных → секция скрыта) ───────────";

  const блок = (rel: string): string => {
    const src = readFileSync(resolve(SITES_ROOT, rel), "utf-8");
    const i = src.indexOf(НАЧАЛО);
    const j = src.indexOf(КОНЕЦ, i);
    expect({ порт: rel, найдено: i > -1 && j > i }).toEqual({ порт: rel, найдено: true });
    return src.slice(i, j).replace(/\s+/g, " ").trim();
  };

  it("у четырёх портов один и тот же текст", () => {
    const эталон = блок(ПОРТЫ[0]);
    for (const порт of ПОРТЫ.slice(1)) {
      expect({ порт, совпадает: блок(порт) === эталон }).toEqual({ порт, совпадает: true });
    }
  });

  it("каждый порт строит фильтры параметров при гидрации", () => {
    for (const порт of ПОРТЫ) {
      expect({ порт, зовёт: код(порт).includes("bindVariants();") }).toEqual({ порт, зовёт: true });
    }
  });
});
