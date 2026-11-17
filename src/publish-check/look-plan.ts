/**
 * Проверка публикации по снимкам черновика (16.11): какие страницы снимать по «что изменилось с прошлой публикации»
 * (`CheckScope`) и какие находки снимка брать. Владелец: «поменялась одна секция — проверяем её», шапку и подвал —
 * сами, один раз; новую страницу — все её секции.
 *
 * - Секции страницы → снимок страницы, находки и метки только этих секций.
 * - Шапка, подвал, «поверх страниц» стоят на каждой странице → их секции смотрим на главной, один раз.
 * - Страница целиком (новая или заменена) → все находки и метки страницы.
 * - Страница без изменённой секции (секцию убрали, скрыли, переставили) → только правила страницы: порядок
 *   заголовков и ориентиры. Меток там нет: убранная секция метку не сломает.
 * - Тема (токены, настройки) меняет вид, а не разметку и не метки — снимать нечего.
 */
import { z } from "zod";
import type { CheckScope } from "../content/check-scope";
import { SHARED_LISTS } from "../store/skeleton/skeleton-layout";
import { grouped } from "./check-report";
import type { CheckFailure, CheckFinding } from "./check-report";

export const HOME_PAGE = "home";
/** Страниц в проверке не больше: снимок страницы на двух устройствах идёт секунды, а публикацию ждут. */
export const MAX_LOOK_PAGES = 6;
/**
 * Путь покупателя — первым в очередь снимков (владелец 17.11). Изменилось больше `MAX_LOOK_PAGES` страниц (первая
 * публикация — все 14+) — снимаем первые. Публикацию закрывает сломанная метка, а метки корзины и оформления живут на
 * своих страницах (снимок кладёт в корзину товары магазина, `look-page.ts`). Раньше очередь шла по списку изменений:
 * на qa nova корзина и оформление были 8-й и 13-й, в снимки не попадали — сломанное оформление первую публикацию не
 * останавливало. Блог, статья, политика дают только предупреждения семантики — им места после пути покупателя.
 */
export const BUYER_PATH: readonly string[] = [
  HOME_PAGE,
  "catalog",
  "product",
  "page-cart",
  "page-checkout",
  "collection",
];

/**
 * Место в очереди снимков. Сначала цели, которые могут закрыть публикацию (секции и страницы целиком — в них метки),
 * среди них путь покупателя первым; «только правила страницы» — в конце: меток там нет, только предупреждения.
 */
function queueRank(target: LookTarget): number {
  const onPath = BUYER_PATH.indexOf(target.page);
  const rank = onPath === -1 ? BUYER_PATH.length : onPath;
  return target.take.kind === "page-rules"
    ? BUYER_PATH.length + 1 + rank
    : rank;
}
/** Секций в задании снимка не больше — предел проверяющего процесса (`look-job.ts`, поле `sections`). */
const MAX_JOB_SECTIONS = 30;

/** Правила страницы, а не секции: их ломает перестановка и удаление секций. */
const PAGE_RULES: ReadonlySet<string> = new Set([
  "heading-level",
  "unique-landmark",
  "landmark-one-main",
  "landmark-unique",
  "landmark-no-duplicate-banner",
  "landmark-no-duplicate-contentinfo",
]);

const SHARED: ReadonlySet<string> = new Set(Object.keys(SHARED_LISTS));

export type LookTake =
  | { kind: "sections"; ids: string[] }
  | { kind: "all" }
  | { kind: "page-rules" };

export interface LookTarget {
  page: string;
  take: LookTake;
}

class Targets {
  private readonly byPage = new Map<string, LookTake>();

  sections(page: string, id: string): void {
    const prev = this.byPage.get(page);
    if (prev?.kind === "all") return;
    if (prev?.kind === "sections") {
      if (!prev.ids.includes(id)) prev.ids.push(id);
      return;
    }
    this.byPage.set(page, { kind: "sections", ids: [id] });
  }

  page(page: string, whole: boolean): void {
    const prev = this.byPage.get(page);
    if (whole) this.byPage.set(page, { kind: "all" });
    else if (prev === undefined) this.byPage.set(page, { kind: "page-rules" });
  }

  list(): LookTarget[] {
    const all = [...this.byPage.entries()].map(([page, take]) => ({
      page,
      take,
    }));
    // Сортировка устойчивая: страницы с одним местом остаются в порядке списка изменений.
    return all.sort((a, b) => queueRank(a) - queueRank(b));
  }
}

/** Что снимать: по странице на цель, в порядке очереди (`queueRank`). Тема в цели не попадает. */
export function lookTargets(scope: CheckScope): LookTarget[] {
  const targets = new Targets();
  for (const section of scope.sections) {
    targets.sections(
      SHARED.has(section.page) ? HOME_PAGE : section.page,
      section.id,
    );
  }
  for (const page of scope.pages) targets.page(page.page, page.whole);
  return targets.list();
}

/** Тело задания снимка (`storefront.look`, README `storefront-builder`): оба устройства — метки жмутся на каждом. */
export function lookJobOf(target: LookTarget): {
  page: string;
  devices: "both";
  full: false;
  clips: false;
  sections?: string[];
} {
  const base = {
    page: target.page,
    devices: "both" as const,
    full: false as const,
    clips: false as const,
  };
  return target.take.kind === "sections"
    ? { ...base, sections: target.take.ids.slice(0, MAX_JOB_SECTIONS) }
    : base;
}

const finding = z.object({
  place: z.enum(["code", "html", "browser", "audit", "shop", "release"]),
  check: z.string(),
  rule: z.string(),
  level: z.enum(["error", "warning"]),
  section: z.string().nullable(),
  where: z.string(),
  text: z.string(),
  count: z.number().int().positive(),
});
const failure = z.object({
  place: z.enum(["code", "html", "browser", "audit", "shop", "release"]),
  check: z.string(),
  reason: z.string(),
});
const markResult = z.object({
  mark: z.string(),
  section: z.string().nullable(),
  status: z.enum(["ok", "broken", "hidden"]),
  text: z.string(),
  device: z.string(),
});
/** Части снимка, которые читает проверка публикации; остальное (картинки, факты, детектор) ей не нужно. */
const snapshotParts = z.object({
  checks: z
    .object({ findings: z.array(finding), failed: z.array(failure) })
    .optional(),
  marks: z
    .union([
      z.object({ ok: z.literal(true), results: z.array(markResult) }),
      z.object({ ok: z.literal(false), reason: z.string() }),
    ])
    .optional(),
});

export interface TakenFindings {
  findings: CheckFinding[];
  failed: CheckFailure[];
}

function keeps(
  take: LookTake,
  section: string | null,
  rule: string | null,
): boolean {
  if (take.kind === "all") return true;
  if (take.kind === "sections")
    return section !== null && take.ids.includes(section);
  return rule !== null && (section === null || PAGE_RULES.has(rule));
}

/** Сломанная метка — ошибка: «если поставлена, то работает» (владелец 06.11), публикацию закрывает. */
function markFinding(result: z.infer<typeof markResult>): CheckFinding {
  return {
    place: "browser",
    check: "marks",
    rule: result.mark,
    level: "error",
    section: result.section,
    where: `метка ${result.mark}`,
    text: `${result.text} · почини секцию или убери метку`,
    count: 1,
  };
}

/** Находки снимка одной цели. Ответ не по форме — проверка не отработала, а не «находок нет». */
export function findingsOf(
  target: LookTarget,
  snapshot: unknown,
): TakenFindings {
  const parsed = snapshotParts.safeParse(snapshot);
  if (!parsed.success) {
    return {
      findings: [],
      failed: [
        {
          place: "browser",
          check: "look",
          reason: `${target.page}: ответ снимка не по форме`,
        },
      ],
    };
  }
  const { checks, marks } = parsed.data;
  const findings = (checks?.findings ?? []).filter((item) =>
    keeps(target.take, item.section, item.rule),
  );
  const failed: CheckFailure[] = [...(checks?.failed ?? [])];
  if (marks && !marks.ok)
    failed.push({
      place: "browser",
      check: "marks",
      reason: `${target.page}: ${marks.reason}`,
    });
  if (marks?.ok && target.take.kind !== "page-rules") {
    const broken = marks.results.filter(
      (item) =>
        item.status === "broken" && keeps(target.take, item.section, null),
    );
    findings.push(...broken.map(markFinding));
  }
  return { findings: grouped(findings), failed };
}
