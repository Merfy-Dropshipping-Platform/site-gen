/**
 * Снимки HTML секций: пять тем × ключевые блоки.
 *
 * Зачем. Правка в общем слое (theme-base, global.css, puckConfig, пайплайн)
 * расходится по пяти темам, и до сих пор единственным способом заметить, что
 * «починили одно — сломали три», был тестер через день. Здесь каждая секция
 * рендерится РЕАЛЬНЫМ скомпилированным модулем темы (тем самым, что уходит на
 * витрину и в превью) с фиксированным набором пропсов, а результат лежит в
 * снимке. Любое изменение разметки видно диффом в момент правки.
 *
 * Снимок — не «правильная вёрстка», а зафиксированное текущее поведение.
 * Изменился намеренно — обновляем снимок осознанно (`jest -u`) и смотрим диф.
 *
 * Требует собранных секций: pnpm build:theme-sections <тема> для всех пяти.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

const padding = { top: 40, bottom: 40 };
const base = { colorScheme: "1", padding };

/**
 * Фикстуры пропсов. Значения намеренно «настроенные», а не дефолтные: снимок
 * должен ловить И пустое состояние, И реакцию на настройки мерчанта.
 */
const JOBS: { block: string; props: Record<string, unknown> }[] = [
  {
    block: "Gallery",
    props: {
      ...base,
      id: "Gallery-1",
      heading: "Галерея",
      items: [
        { id: "i1", type: "image", url: "", alt: "Изображение" },
        { id: "i2", type: "product", productId: null },
        { id: "i3", type: "collection", collectionId: null },
      ],
      layout: "featured",
      imagePosition: "left",
    },
  },
  {
    block: "PopularProducts",
    props: {
      ...base,
      id: "Popular-1",
      heading: "Популярное",
      cards: 4,
      columns: 4,
    },
  },
  {
    block: "Collections",
    props: {
      ...base,
      id: "Collections-1",
      heading: "Коллекции",
      collections: [
        { id: "c1", collectionId: null, heading: "Коллекция", description: "" },
      ],
      columns: 2,
    },
  },
  {
    block: "Slideshow",
    props: {
      ...base,
      id: "Slideshow-1",
      slides: [
        {
          id: "s1",
          imageUrl: "",
          heading: "Слайд",
          subtitle: "Подзаголовок",
          ctaText: "Кнопка",
          ctaUrl: "/catalog",
          position: "middle-left",
        },
      ],
      interval: 5,
      autoplay: false,
    },
  },
  {
    block: "MainText",
    props: {
      ...base,
      id: "MainText-1",
      heading: "<strong><em>Заголовок</em></strong>",
      text: { content: "Текст секции" },
      position: "center",
    },
  },
  {
    block: "ImageWithText",
    props: {
      ...base,
      id: "ImageWithText-1",
      image: { url: "", alt: "" },
      heading: "Заголовок",
      text: { content: "Текст" },
      button: { text: "Кнопка", href: "/catalog" },
      imagePosition: "left",
    },
  },
  {
    block: "Newsletter",
    props: {
      ...base,
      id: "Newsletter-1",
      heading: "Подписка",
      description: "Описание",
      placeholder: "E-mail",
      buttonText: "Отправить",
    },
  },
  {
    block: "PromoBanner",
    props: {
      ...base,
      id: "PromoBanner-1",
      text: "Объявление",
      linkText: "Подробнее",
      linkUrl: "/",
    },
  },
  {
    block: "CollapsibleSection",
    props: {
      ...base,
      id: "Collapsible-1",
      heading: "Вопросы",
      sections: [{ id: "s1", heading: "Вопрос", content: "Ответ" }],
    },
  },
  {
    block: "MultiColumns",
    props: {
      ...base,
      id: "MultiColumns-1",
      heading: "Колонки",
      columns: [{ id: "c1", heading: "Колонка", text: "Текст", imageUrl: "" }],
      displayColumns: 2,
    },
  },
  {
    block: "MultiRows",
    props: {
      ...base,
      id: "MultiRows-1",
      heading: "Ряды",
      rows: [
        {
          id: "r1",
          heading: "Ряд",
          text: "Текст",
          imageUrl: "",
          imagePosition: "left",
          button: { text: "", href: "" },
        },
      ],
    },
  },
  {
    block: "Video",
    props: {
      ...base,
      id: "Video-1",
      heading: "Видео",
      videoUrl: "",
      poster: "",
    },
  },
  {
    block: "Publications",
    props: {
      ...base,
      id: "Publications-1",
      heading: "Публикации",
      columns: 2,
      cards: 2,
    },
  },
];

/**
 * Нормализация: из разметки уходит всё, что меняется от запуска к запуску, —
 * иначе снимок падал бы на ровном месте и его перестали бы читать.
 */
function normalize(html: string): string {
  return html
    .replace(/\b\d{10,}\b/g, "NNN")
    .replace(/astro-[a-z0-9]{8,}/gi, "astro-HASH")
    .replace(/\s+/g, " ")
    .trim();
}

function renderTheme(theme: string): Record<string, string> {
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(JOBS)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = JSON.parse(raw) as {
    block: string;
    html?: string;
    missing?: boolean;
    error?: string;
  }[];
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.missing) out[r.block] = "(в теме нет такой секции)";
    else if (r.error) out[r.block] = `ОШИБКА РЕНДЕРА: ${r.error}`;
    else out[r.block] = normalize(r.html ?? "");
  }
  return out;
}

describe.each(THEMES)("снимки секций — %s", (theme) => {
  const dist = resolve(
    SITES_ROOT,
    "dist",
    "theme-sections",
    theme,
    "manifest.json",
  );
  const built = existsSync(dist);
  let rendered: Record<string, string>;

  beforeAll(() => {
    if (built) rendered = renderTheme(theme);
  }, 120_000);

  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(built).toBe(true);
  });

  for (const { block } of JOBS) {
    it(`${block} рендерится без ошибок`, () => {
      if (!built) return;
      expect(rendered[block]).not.toMatch(/^ОШИБКА РЕНДЕРА/);
    });

    it(`${block} — снимок разметки`, () => {
      if (!built) return;
      expect(rendered[block]).toMatchSnapshot();
    });
  }
});
