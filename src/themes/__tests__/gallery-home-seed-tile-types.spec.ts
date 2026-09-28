import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * «Галерея» на главной — состав плиток как у новой секции из каталога.
 *
 * Задача 25.09 (бриф `BURGER-GALLERY-BRIEF.md`, п.2). Было: rose/flux/bloom
 * сидировали главную тремя плитками ТИПА «Изображение» (наследие ранних
 * сидов, когда у «Галереи» ещё не было типов «Товар»/«Коллекция»). Новая
 * «Галерея», которую мерчант тащит из каталога секций, даёт три плитки
 * РАЗНЫХ типов — панель `GalleryPuckConfig.defaults.items` (image → product →
 * collection). Решение владельца: на главной — как у новой секции.
 *
 * Канон панели читается из ИСХОДНИКА `Gallery.puckConfig.ts` текстом, а не
 * TS-импортом модуля: у файла есть отдельная, намеренная несостыковка типов
 * (`defaults` не указывает `padding`, хотя схема требует его — комментарий
 * в файле объясняет это как сознательный выбор, чтобы дефолт панели не
 * перебивал ритм темы). Из-за него `import { GalleryPuckConfig } from …`
 * валит ts-jest на чужом файле («Property 'padding' is missing…», не по этой
 * задаче и не трогается здесь). Тот же приём («смотрим исходник, а не
 * импортируем») уже используется в `header-burger-position.spec.ts`.
 *
 * vanilla и satin «Галерею» на главной не показывают — второй describe
 * держит это как факт (ничего добавлять не просили).
 */
const ROOT = resolve(__dirname, "..", "..", "..");

const GALLERY_PUCK_CONFIG = resolve(
  ROOT,
  "packages/theme-base/blocks/Gallery/Gallery.puckConfig.ts",
);

const THEMES_WITH_HOME_GALLERY = ["rose", "flux", "bloom"] as const;
const THEMES_WITHOUT_HOME_GALLERY = ["vanilla", "satin"] as const;

type SeedItem = { id?: string; type?: string; url?: string };
type SeedBlock = { type: string; props?: { items?: SeedItem[] } };

function homeSeed(theme: string): { content: SeedBlock[] } {
  const raw = readFileSync(
    resolve(ROOT, "packages", `theme-${theme}`, "pages", "home.json"),
    "utf8",
  );
  return JSON.parse(raw);
}

function galleryBlock(theme: string): SeedBlock | undefined {
  return homeSeed(theme).content.find((b) => b.type === "Gallery");
}

/** Массив `defaults.items` из блока `defaults: { … }` — по границе скобок `[...]`. */
function panelDefaultItemTypes(): string[] {
  const src = readFileSync(GALLERY_PUCK_CONFIG, "utf8");
  const defaultsAt = src.indexOf("defaults: {");
  if (defaultsAt < 0) {
    throw new Error("«defaults: {» не найден в Gallery.puckConfig.ts");
  }
  const itemsAt = src.indexOf("items: [", defaultsAt);
  if (itemsAt < 0) {
    throw new Error("«defaults.items» не найден в Gallery.puckConfig.ts");
  }
  const arrStart = src.indexOf("[", itemsAt);
  let depth = 0;
  let i = arrStart;
  for (; i < src.length; i++) {
    if (src[i] === "[") depth += 1;
    else if (src[i] === "]") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const arrSrc = src.slice(arrStart, i + 1);
  return [...arrSrc.matchAll(/type:\s*'(\w+)'/g)].map((m) => m[1]);
}

describe("«Галерея» на главной — состав и порядок плиток как у новой секции", () => {
  const panelTypes = panelDefaultItemTypes();

  it("канон панели (пин, чтобы отклонение было явным): image → product → collection", () => {
    expect(panelTypes).toEqual(["image", "product", "collection"]);
  });

  it.each(THEMES_WITH_HOME_GALLERY)(
    "%s: главная — Gallery.items совпадает с defaultProps панели по составу и порядку",
    (theme) => {
      const block = galleryBlock(theme);
      expect({ theme, найдена: Boolean(block) }).toEqual({
        theme,
        найдена: true,
      });
      const seedTypes = (block?.props?.items ?? []).map((i) => i.type);
      expect({ theme, seedTypes }).toEqual({ theme, seedTypes: panelTypes });
    },
  );

  it.each(THEMES_WITH_HOME_GALLERY)(
    "%s: плитка «Изображение» — рабочее фото (непустой https-url)",
    (theme) => {
      const block = galleryBlock(theme);
      const imageItem = (block?.props?.items ?? []).find(
        (i) => i.type === "image",
      );
      expect({ theme, url: imageItem?.url }).toEqual({
        theme,
        url: expect.stringMatching(/^https:\/\/.+/),
      });
    },
  );

  it.each(THEMES_WITHOUT_HOME_GALLERY)(
    "%s: на главной «Галереи» нет — не добавляли",
    (theme) => {
      const hasGallery = Boolean(galleryBlock(theme));
      expect({ theme, hasGallery }).toEqual({ theme, hasGallery: false });
    },
  );
});
