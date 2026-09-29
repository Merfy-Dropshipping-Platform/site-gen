/**
 * Сид каталога тем (этап 3, кусок 3.4; И5): пять тем с описанием из кабинета,
 * «подходит для» из Merfy Docs и превью.
 *
 * Строки таблицы `theme` для пяти тем заводит загрузка пресетов на старте
 * сервиса (`ThemePresetModule` → `seedFromFiles`, upsert по id) из
 * `seed/theme-presets/<тема>.json` — поэтому данные каталога лежат там же,
 * а не в миграции (миграцию затёр бы следующий старт).
 *
 * Источники:
 *   - описание и превью — `MerfyFrontend/src/components/OnShopPage/ShopTheme/themesData.ts`
 *     (то, что мерчант видит в кабинете сегодня; пути — статика кабинета);
 *   - «подходит для» — Merfy Docs, «Выбор темы для магазина».
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ThemePresetSchema } from "./theme-preset.schema";
import { ThemePresetService } from "./theme-preset.service";
import * as schema from "../../db/schema";

const SEED_DIR = resolve(__dirname, "..", "..", "..", "seed", "theme-presets");
const THEMES = ["rose", "vanilla", "bloom", "flux", "satin"] as const;

const preset = (id: string) =>
  ThemePresetSchema.parse(
    JSON.parse(readFileSync(resolve(SEED_DIR, `${id}.json`), "utf-8")),
  );

/** Ровно то, что пишет кабинет (themesData.ts) и Docs, — сверка по фактам. */
const EXPECTED: Record<
  string,
  { description: string; fitsFor: string[]; preview: string }
> = {
  rose: {
    description: "Минималистичная тема, где товар занимает центральное место",
    fitsFor: ["Одежда", "Аксессуары", "Товары широкой категории"],
    preview: "Rose",
  },
  vanilla: {
    description: "Спокойная тема с акцентом на атмосферу и комфорт",
    fitsFor: ["Товары для дома", "Декор", "Handmade", "Свечи", "Текстиль"],
    preview: "Vanilla",
  },
  bloom: {
    description: "Энергичная тема с акцентом на визуал и детали товара",
    fitsFor: ["Косметика", "Уход за кожей", "Парфюмерия", "Beauty-боксы"],
    preview: "Bloom",
  },
  flux: {
    description: "Динамичная тема с чёткой навигацией и акцентом на визуал",
    fitsFor: ["Электроника", "Гаджеты", "Аксессуары для техники"],
    preview: "Flux",
  },
  satin: {
    description: "Утончённая тема с акцентом на текстуру и детали",
    fitsFor: ["Аксессуары", "Украшения", "Премиум-товары"],
    preview: "Satin",
  },
};

describe("сид каталога тем: seed/theme-presets", () => {
  it.each(THEMES)(
    "%s: описание кабинета, «подходит для» из Docs, превью",
    (id) => {
      const p = preset(id);
      const want = EXPECTED[id];
      expect(p.description).toBe(want.description);
      expect(p.fitsFor).toEqual(want.fitsFor);
      expect(p.previewDesktop).toBe(
        `/img/online_shop_page/${want.preview}_shop_page.png`,
      );
      expect(p.previewMobile).toBe(
        `/img/online_shop_page/${want.preview}_shop_page_mobile.png`,
      );
    },
  );

  it("seedFromFiles пишет «подходит для» в строку темы (и при вставке, и при обновлении)", async () => {
    const written: Array<{ op: "insert" | "update"; values: any }> = [];
    let existing = false;
    const db: any = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => (existing ? [{ id: "x" }] : []) }),
        }),
      }),
      insert: (tbl: unknown) => ({
        values: async (values: any) => {
          if (tbl === schema.theme) written.push({ op: "insert", values });
        },
      }),
      update: (tbl: unknown) => ({
        set: (values: any) => ({
          where: async () => {
            if (tbl === schema.theme) written.push({ op: "update", values });
          },
        }),
      }),
    };
    const service = new ThemePresetService(db);
    (service as any).seedDir = SEED_DIR;

    await service.seedFromFiles();
    existing = true;
    await service.seedFromFiles();

    const byOp = (op: string) => written.filter((w) => w.op === op);
    expect(byOp("insert")).toHaveLength(THEMES.length);
    expect(byOp("update")).toHaveLength(THEMES.length);
    for (const w of written) {
      expect(w.values.fitsFor).toEqual(
        EXPECTED[w.values.slug ?? w.values.id]?.fitsFor ?? expect.any(Array),
      );
    }
    const rose = written.find(
      (w) => w.op === "update" && w.values.slug === "rose",
    )!;
    expect(rose.values).toMatchObject({
      description: EXPECTED.rose.description,
      fitsFor: EXPECTED.rose.fitsFor,
      previewDesktop: "/img/online_shop_page/Rose_shop_page.png",
    });
  });
});
