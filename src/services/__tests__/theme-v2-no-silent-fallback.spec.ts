import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Sторож регрессии «изменения не применяются без reload» для vanilla/bloom/
 * satin/rose — сестра `flux-v2-home-sections.spec.ts` (spec 111,
 * task-10 brief), которая закрывала ровно эту дыру, но ТОЛЬКО для flux.
 *
 * Механизм бага (владелец, 16.09, пункт 4): «все темы кроме Rose, при
 * изменениях в секция или параметрах... требуется перезагрузка страницы».
 * Расследование (см. WORKLOG/STATUS 2026-09-16) прошло весь путь update-block
 * вручную через браузер (postMessage → POST /preview/block → DOM-патч) для
 * всех 5 тем и не нашло текущей поломки — но нашло СИСТЕМНУЮ дыру в гардах:
 * этот класс регрессии УЖЕ случался минимум трижды (allowlist [rose,vanilla]
 * — fix 121b7202; AstroBlockBridge никогда не монтировался — fix 7a33f4c;
 * blockId-префикс вместо blockType — worklog W-013, 2026-09-01) и КАЖДЫЙ раз
 * проявлялся ИМЕННО как «rose работает, остальные — нет», потому что
 * `packages/theme-base` ≈ rose-порт: тихий fallback на theme-base незаметен
 * для rose и ломает всё для остальных тем.
 *
 * Общий механизм тихого провала: если `resolveV2Section` (preview.service.ts)
 * не находит секцию темы в `dist/theme-sections/<theme>/manifest.json` (или
 * скомпилированный модуль падает при импорте/рендере), резолвер молча
 * откатывается на generic `packages/theme-base/blocks/<Type>`. HTTP всё ещё
 * 200, `data-puck-component-id` на месте — точечный hot-render У КОНСТРУКТОРА
 * "срабатывает", но подставляет ЧУЖУЮ вёрстку/логику темы. Мерчант либо не
 * видит изменения (для полей, которых у theme-base нет), либо видит визуально
 * неправильный блок — и то и другое читается тестировщиком как «не
 * применилось, нужен reload». До этой спеки только flux был защищён от
 * regresси; vanilla/bloom/satin могли молча откатиться на base и никто бы не
 * узнал до жалобы мерчанта.
 *
 * Стратегия и ограничения — идентичны flux-версии (см. её шапку):
 *  - рендерим через `render-probe.mjs` (subprocess), а не
 *    `PreviewService.renderBlock` in-process — ts-jest не умеет
 *    dynamic-import скомпилированных .mjs секций (см. флюс-спеку).
 *  - маркер — литерал, гарантированно присутствующий в РЕАЛЬНОМ V2-рендере
 *    каждого канонического блока темы и ОТСУТСТВУЮЩИЙ в соответствующем
 *    `packages/theme-base/blocks/<Type>` источнике (проверено ниже
 *    программно, не на глаз) — если resolveV2Section тихо откатится на base,
 *    маркер исчезнет и тест покраснеет.
 *  - Rose — особый случай: `packages/theme-base` УЖЕ ≈ rose-порт (историческая
 *    причина, почему rose «просто работал»), поэтому ни одного стабильного
 *    маркера, отсутствующего в base ВО ВСЕХ 7 канонических блоках, не нашлось
 *    (проверено эмпирически). Rose получает облегчённую версию гарда:
 *    манифест + `data-puck-component-id` — этого достаточно, чтобы поймать
 *    «секция не резолвится вовсе» (manifest miss / import throw), только не
 *    «тихо стала theme-base» (для rose это почти no-op по построению).
 */

interface ThemeCase {
  theme: string;
  /** packages/theme-<theme>/pages/home.json content, тот же порядок. */
  homeOrder: readonly string[];
  /**
   * Литерал (один на всю тему) ИЛИ карта {тип блока → литерал}, если единого
   * маркера на все канонические блоки темы не нашлось (bloom — часть блоков
   * не делит общий padding-класс с остальными). Каждый маркер проверен
   * программно: присутствует в V2-рендере СВОЕГО блока (реальные props из
   * home.json) и отсутствует в соответствующем theme-base источнике.
   * `null` — теме нечем гарантировать «не theme-base» (см. Rose выше);
   * блок только на манифест + data-puck-component-id.
   */
  marker: string | Record<string, string> | null;
  markerLabel: string;
}

function markerFor(
  marker: string | Record<string, string> | null,
  type: string,
): string | null {
  if (marker === null) return null;
  return typeof marker === "string" ? marker : (marker[type] ?? null);
}

const CASES: ThemeCase[] = [
  {
    theme: "vanilla",
    homeOrder: [
      "Header",
      "Hero",
      "Collections",
      "Gallery",
      "PopularProducts",
      "Footer",
    ],
    // themes/vanilla/src/styles/global.css — утилитарный класс вёрстки
    // vanilla (padding-контейнер секций), которого нет в дженерик
    // theme-base/blocks/<Type> ни для одного из этих 6 типов.
    marker: "vanilla-pad",
    markerLabel: "vanilla-only container class",
  },
  {
    theme: "bloom",
    homeOrder: [
      "PromoBanner",
      "Header",
      "Hero",
      "PopularProducts",
      "MainText",
      "Gallery",
      "MultiColumns",
      "Footer",
    ],
    // Нет единого bloom-именованного литерала во ВСЕХ 8 типах (font-inter/
    // font-urbanist есть не везде с реальными home.json props) — карта по
    // типу блока: `2xl:px-[300px]` (padding-контейнер секций bloom-вёрстки,
    // themes/bloom/src/styles) покрывает 7 из 8; PromoBanner его не
    // использует (однострочный баннер, не секция), у него свой
    // `data-bloom-announcement`; Header и PopularProducts дополнительно
    // сверяются своими `data-bloom-*`/`bloom-product-name` литералами, где
    // они специфичнее общего паттерна.
    marker: {
      PromoBanner: "data-bloom-announcement",
      Header: "data-bloom-header",
      Hero: "2xl:px-[300px]",
      PopularProducts: "bloom-product-name",
      MainText: "2xl:px-[300px]",
      Gallery: "2xl:px-[300px]",
      MultiColumns: "2xl:px-[300px]",
      Footer: "2xl:px-[300px]",
    },
    markerLabel: "bloom section container padding / data-bloom-* markers",
  },
  {
    theme: "satin",
    homeOrder: ["Header", "Hero", "Collections", "PopularProducts", "Footer"],
    // themes/satin/src/styles/global.css — --font-nt-ui: "Arsenal"/Manrope
    // тело; font-manrope используется во всех 5 канонических блоках сатина
    // и отсутствует в theme-base для всех пяти.
    marker: "font-manrope",
    markerLabel: "satin-only font utility",
  },
  {
    theme: "rose",
    homeOrder: [
      "PromoBanner",
      "Header",
      "Hero",
      "Collections",
      "PopularProducts",
      "Gallery",
      "Footer",
    ],
    // См. шапку файла: rose ≈ theme-base по построению — нет маркера с
    // «зубами» (any литерал, найденный в rose, тоже нашёлся в base хотя бы
    // для одного из 7 типов). Облегчённый гард (manifest + id) ниже.
    marker: null,
    markerLabel: "(rose ≈ theme-base — fallback marker not meaningful)",
  },
];

const SITES_ROOT = process.cwd();
const RENDER_PROBE = resolve(SITES_ROOT, "render-probe.mjs");

// packages/theme-base/blocks/<Dir>/<File>.astro — источник, который скастует
// cascade-тир резолвера, если resolveV2Section когда-нибудь вернёт null для
// этого типа (ровно тот риск, от которого стережёт эта спека).
const BASE_BLOCK_SOURCE: Record<string, string> = {
  PromoBanner: "PromoBanner/PromoBanner.astro",
  Header: "Header/Header.astro",
  Hero: "Hero/Hero.astro",
  Collections: "Collections/Collections.astro",
  PopularProducts: "PopularProducts/PopularProducts.astro",
  Gallery: "Gallery/Gallery.astro",
  Footer: "Footer/Footer.astro",
  MainText: "MainText/MainText.astro",
  MultiColumns: "MultiColumns/MultiColumns.astro",
};

interface HomeBlock {
  type: string;
  props: Record<string, unknown>;
}

interface ProbeResult {
  ok: boolean;
  html: string;
  stderr: string;
  status: number | null;
}

/**
 * Рендерит V2-секцию темы через ТОТ ЖЕ манифест-driven механизм, что и
 * PreviewService.renderBlock (resolveV2Section + defaultContainerFactory +
 * Container.renderToString) — но в отдельном процессе через render-probe.mjs
 * (ts-jest не умеет dynamic-import скомпилированные .mjs секции in-process).
 */
function renderViaProbe(
  theme: string,
  blockName: string,
  props: Record<string, unknown>,
): ProbeResult {
  const res = spawnSync(
    process.execPath,
    [RENDER_PROBE, theme, blockName, JSON.stringify(props)],
    { encoding: "utf-8", maxBuffer: 20 * 1024 * 1024 },
  );
  return {
    ok: res.status === 0,
    html: res.stdout ?? "",
    stderr: res.stderr ?? "",
    status: res.status,
  };
}

describe.each(CASES)(
  "theme=$theme — V2 section resolver: no silent theme-base fallback",
  ({ theme, homeOrder, marker, markerLabel }) => {
    const MANIFEST_PATH = resolve(
      SITES_ROOT,
      "dist",
      "theme-sections",
      theme,
      "manifest.json",
    );
    const HOME_JSON_PATH = resolve(
      SITES_ROOT,
      "packages",
      `theme-${theme}`,
      "pages",
      "home.json",
    );

    let manifest: Record<string, string>;
    let homeBlocks: HomeBlock[];
    const rendered = new Map<string, ProbeResult>();

    beforeAll(async () => {
      try {
        manifest = JSON.parse(
          await readFile(MANIFEST_PATH, "utf-8"),
        ) as Record<string, string>;
      } catch (err) {
        throw new Error(
          `dist/theme-sections/${theme}/manifest.json missing/unreadable at ${MANIFEST_PATH}. ` +
            `Run 'pnpm build:theme-sections ${theme}' before this test. ` +
            `Original error: ${(err as Error)?.message ?? err}`,
        );
      }

      const home = JSON.parse(await readFile(HOME_JSON_PATH, "utf-8")) as {
        content: HomeBlock[];
      };
      homeBlocks = home.content.filter((b) => homeOrder.includes(b.type));

      for (const block of homeBlocks) {
        rendered.set(block.type, renderViaProbe(theme, block.type, block.props));
      }
    }, 30000);

    it(`packages/theme-${theme}/pages/home.json содержит все канонические типы (${homeOrder.length})`, () => {
      const types = homeBlocks.map((b) => b.type);
      for (const t of homeOrder) expect(types).toContain(t);
    });

    describe(`dist/theme-sections/${theme}/manifest.json маппит каждый канонический тип (собрано 'pnpm build:theme-sections ${theme}')`, () => {
      it.each(homeOrder)("%s имеет непустой маппинг в манифесте", (type) => {
        expect(typeof manifest[type]).toBe("string");
        expect(manifest[type].length).toBeGreaterThan(0);
      });
    });

    describe(`PreviewService.renderBlock({ themeId: "${theme}" }) резолвит V2-секцию темы, а не theme-base fallback`, () => {
      it.each(homeOrder)(
        "%s: resolveV2Section рендерится успешно (без отката на theme-base)",
        (type) => {
          const result = rendered.get(type);
          expect(result).toBeDefined();
          if (!result!.ok) {
            throw new Error(
              `render-probe.mjs упал для ${theme}/${type} (exit ${result!.status}) — ` +
                `V2-секция не резолвится/не рендерится — ровно тот риск тихого ` +
                `отката, от которого стережёт эта спека. stderr:\n${result!.stderr}`,
            );
          }
          expect(result!.html.length).toBeGreaterThan(0);
        },
      );

      it.each(homeOrder)(
        "%s: data-puck-component-id на корне соответствует id блока (конструктор адресует секцию для hot-render)",
        (type) => {
          const result = rendered.get(type)!;
          const block = homeBlocks.find((b) => b.type === type)!;
          const id = block.props.id as string;
          expect(typeof id).toBe("string");
          expect(id.length).toBeGreaterThan(0);
          expect(result.html).toContain(`data-puck-component-id="${id}"`);
        },
      );

      if (marker !== null) {
        it.each(homeOrder)(
          `%s: рендер содержит маркер темы (${markerLabel}) — theme-base его не производит`,
          (type) => {
            const m = markerFor(marker, type);
            expect(m).not.toBeNull();
            const result = rendered.get(type)!;
            expect(result.html).toContain(m);
          },
        );
      }
    });

    if (marker !== null) {
      describe(`маркер темы (${markerLabel}) имеет "зубы": theme-base источники его НЕ содержат (иначе проверка выше бессмысленна)`, () => {
        it.each(homeOrder)(
          "%s: соответствующий packages/theme-base/blocks не содержит маркер темы",
          async (type) => {
            const m = markerFor(marker, type);
            expect(m).not.toBeNull();
            const file = BASE_BLOCK_SOURCE[type];
            expect(file).toBeDefined();
            const src = await readFile(
              resolve(SITES_ROOT, "packages", "theme-base", "blocks", file),
              "utf-8",
            );
            expect(src).not.toContain(m);
          },
        );
      });
    }
  },
);
