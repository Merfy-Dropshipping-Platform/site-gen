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
const ПРОПУСК = ["node_modules", "/dist/", "__snapshots__", "/.astro/", "/dist-"];

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
      { путь: "themes/luna/src/pages/cart.astro", почему: "luna вне объёма (AGENTS.md)" },
      { путь: "themes/bloom/src/lib/nt-cart-bloom.ts", почему: "мёртвая копия ядра, импортов нет" },
      { путь: "themes/satin/src/lib/nt-cart-satin.ts", почему: "мёртвая копия ядра, импортов нет" },
      { путь: "themes/vanilla/src/lib/nt-cart-vanilla.ts", почему: "мёртвая копия ядра, импортов нет" },
    ],
  },
  {
    имя: "вариант по умолчанию = «первая доступная комбинация»",
    шаблон: /\.find\(\s*\(c\)\s*=>\s*c\s*&&\s*c\.available\s*!==\s*false\s*\)/,
    вместо: "pickDefaultCombination (или __merfyPickDefaultCombination в is:inline)",
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
    вместо: "<script is:inline set:html={…_SOURCE}> — модульный даёт 404 на витрине",
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
    const нарушители = ВСЕ.filter((f) => !разрешено.has(f) && з.шаблон.test(код(f)));
    expect({ запрет: з.имя, нарушители, вместо: з.вместо }).toEqual({
      запрет: з.имя,
      нарушители: [],
      вместо: з.вместо,
    });
  });

  it.each(ЗАПРЕТЫ.flatMap((з) => з.исключения.map((и) => [`${з.имя} — ${и.путь}`, з, и] as const)))(
    "исключение живо: %s",
    (_имя, з, и) => {
      // Исключение без нарушения = список протух и начал прятать новое.
      const есть = ВСЕ.includes(и.путь) && з.шаблон.test(код(и.путь));
      expect({ путь: и.путь, почему: и.почему, ещёНужно: есть }).toEqual({
        путь: и.путь,
        почему: и.почему,
        ещёНужно: true,
      });
    },
  );
});
