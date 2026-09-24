/**
 * Эталон «что потеряно» при смене темы — канон прежней темы, прогнанный теми
 * же шагами, что порт при чтении (`presentCanonLikePort`, canon-reference.ts).
 *
 * 1. Канон — общий кэш LazySeed на процесс: шаги не имеют права менять вход
 *    (заморозка — любая запись в него бросает).
 * 2. Нетронутый магазин не имеет «потерянного»: для каждой из пяти тем тело
 *    каждой страницы эталона совпадает с тем, что отдаёт НАСТОЯЩИЙ
 *    `DocumentAdapter.load` для ревизии-канона. Иначе отчёт SetTheme видел бы
 *    правки мерчанта там, где их нет.
 */
import { presentCanonLikePort } from "../canon-reference";
import { pageBodyFingerprint } from "../theme-switch.plan";
import { DocumentAdapter } from "../../../content/document.adapter";
import { SitesDomainService } from "../../../sites.service";

const THEMES = ["rose", "flux", "satin", "bloom", "vanilla"] as const;
const SITE = { name: "Шёлк", publicUrl: "https://shelk.merfy.ru" };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>))
      deepFreeze(v);
  }
  return value;
}

async function canonOf(themeId: string): Promise<Record<string, any>> {
  const dep = {} as any;
  const sites = new SitesDomainService(
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
  );
  return JSON.parse(JSON.stringify(await sites.buildInitialRevision(themeId)));
}

/** БД-заглушка под `DocumentAdapter.load`: одна ревизия с данными `data`. */
function portOver(data: unknown) {
  const db: any = {
    select: () => ({ from: () => ({ where: async () => [{ data }] }) }),
  };
  return new DocumentAdapter(db);
}

describe("presentCanonLikePort", () => {
  it.each(THEMES)(
    "%s: замороженный канон — шаги его не трогают",
    async (theme) => {
      const canon = await canonOf(theme);
      const frozen = deepFreeze(JSON.parse(JSON.stringify(canon)));

      const fromFrozen = await presentCanonLikePort(frozen, theme, SITE);
      const fromCopy = await presentCanonLikePort(canon, theme, SITE);

      expect(fromFrozen).toEqual(fromCopy);
      expect(frozen).toEqual(await canonOf(theme));
    },
  );

  it.each(THEMES)(
    "%s: тело каждой страницы эталона = то, что отдаёт порт для ревизии-канона",
    async (theme) => {
      const canon = await canonOf(theme);
      const reference = await presentCanonLikePort(canon, theme, SITE);
      const loaded = await portOver(canon).load("site-1", {
        site: { themeId: theme, ...SITE, currentRevisionId: "rev-1" },
      });

      const refPages = reference.pagesData as Record<string, unknown>;
      const docPages = loaded.document.pagesData as Record<string, unknown>;
      const differing = Object.keys(refPages).filter(
        (id) =>
          pageBodyFingerprint(refPages[id]) !==
          pageBodyFingerprint(docPages[id]),
      );

      expect(Object.keys(refPages).length).toBeGreaterThan(5);
      expect(differing).toEqual([]);
    },
  );
});
