/**
 * Проверка публикации магазина новой темы на платформе (16.11; раньше жила в merfy-mcp `publish.ts`). Владелец:
 * «поменялась одна секция — проверяем её» — проверяется только изменённое с прошлой публикации (`site.
 * published_revision_id` → черновик), а не весь магазин; первая публикация — весь магазин.
 *
 * Что проверяется:
 *  - страницы со снимком черновика (`look-plan.ts`): метки (сломанная — ошибка) и семантика (предупреждение) по
 *    изменённым секциям;
 *  - магазин целиком: товары в каталоге (нет ни одного — ошибка).
 * Ошибка закрывает публикацию — и из MCP, и из кабинета (владелец 16.11: «блокировать везде»); мерчант может
 * опубликовать как есть (`skipChecks`). Сбой самой проверки публикацию не закрывает: ложный красный хуже.
 *
 * Нынешние темы (не новая тема) не проверяются — у них нет снимка черновика и меток.
 */
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { firstValueFrom, timeout } from "rxjs";
import { PG_CONNECTION, PRODUCT_RMQ_SERVICE } from "../constants";
import * as schema from "../db/schema";
import { StoreContentService } from "../content/store-content.service";
import { toStoreContentSite } from "../content/store-content.port";
import type { CheckScope } from "../content/check-scope";
import { StorefrontHandoff } from "../storefront-handoff/storefront-handoff.service";
import {
  acrossPages,
  type CheckFailure,
  type CheckFinding,
  type PublishCheck,
} from "./check-report";
import {
  findingsOf,
  lookJobOf,
  lookTargets,
  MAX_LOOK_PAGES,
} from "./look-plan";
import type { LookTarget, TakenFindings } from "./look-plan";
import { StorefrontLookClient } from "./look.client";
import type { LookOutcome, LookRunner } from "./look.client";

/** Снимков разом: столько мест у отрисовщика проверяющего процесса. */
const LOOKS_AT_ONCE = 2;
/** Сколько ждём снимок страницы — как шлюз (`LOOK_WAIT_MS`). */
export const PAGE_LOOK_WAIT_MS = 55_000;
/** Вся проверка снимками — не дольше: публикацию ждут. Не успели — оставшиеся страницы «не проверены». */
export const PUBLISH_CHECK_BUDGET_MS = 90_000;
const PRODUCTS_TIMEOUT_MS = 10_000;

export type PublishGate =
  | { blocked: true; check: PublishCheck; message: string }
  | { blocked: false; check: PublishCheck | null };

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Отказ снимка словами — для `failed`. */
function lookFailure(
  page: string,
  outcome: Exclude<LookOutcome, { kind: "snapshot" }>,
): CheckFailure {
  const reason =
    outcome.kind === "timeout"
      ? "снимок не успел"
      : outcome.kind === "unavailable"
        ? outcome.reason
        : outcome.message;
  return { place: "browser", check: "look", reason: `${page}: ${reason}` };
}

/** Ошибки проверки одной строкой каждая — для отказа публикации (кабинет показывает `message` как есть). */
export function blockedMessage(check: PublishCheck): string {
  const errors = check.findings.filter((finding) => finding.level === "error");
  const lines = errors
    .slice(0, 5)
    .map(
      (finding) =>
        `• ${finding.where}${finding.section ? ` (секция ${finding.section})` : ""}: ${finding.text}`,
    );
  const more = errors.length > 5 ? [`…ещё ${errors.length - 5}`] : [];
  return [
    `Публикация остановлена: нужно починить ${errors.length}`,
    ...lines,
    ...more,
  ].join("\n");
}

@Injectable()
export class PublishCheckService {
  private readonly logger = new Logger(PublishCheckService.name);
  private readonly looks: LookRunner;
  private readonly clock: () => number;

  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    private readonly content: StoreContentService,
    @Inject(PRODUCT_RMQ_SERVICE) private readonly products: ClientProxy,
    looks: StorefrontLookClient,
    @Optional() private readonly handoff?: StorefrontHandoff,
  ) {
    this.looks = looks;
    this.clock = Date.now;
  }

  /** Проверка перед публикацией; `null` — магазин нынешней темы или без черновика: проверять нечего. */
  async check(tenantId: string, siteId: string): Promise<PublishCheck | null> {
    const site = await this.site(tenantId, siteId);
    const revisionId = site.currentRevisionId;
    if (!revisionId || (await this.handoff?.isNewTheme(siteId)) !== true)
      return null;
    const since = site.publishedRevisionId ?? null;
    const [scoped, shop] = await Promise.all([
      this.scope(siteId, site, since, revisionId),
      this.catalog(siteId),
    ]);
    const targets = scoped.scope ? lookTargets(scoped.scope) : [];
    const looked = await this.lookAll(siteId, targets);
    const findings = [...acrossPages(looked.findings), ...shop.findings];
    return {
      since,
      revisionId,
      pages: targets.slice(0, MAX_LOOK_PAGES).map((target) => target.page),
      findings,
      failed: [...scoped.failed, ...looked.failed, ...shop.failed],
      blocked: findings.some((finding) => finding.level === "error"),
    };
  }

  /** Перед публикацией: проверка (если не `skip`) и решение, пускать ли. */
  async gate(
    tenantId: string,
    siteId: string,
    skip: boolean,
  ): Promise<PublishGate> {
    if (skip) return { blocked: false, check: null };
    const check = await this.check(tenantId, siteId);
    if (check?.blocked)
      return { blocked: true, check, message: blockedMessage(check) };
    return { blocked: false, check };
  }

  /**
   * Публикация прошла: запомнить опубликованную ревизию — следующая проверка смотрит изменённое с неё. Проверенная
   * ревизия, иначе (публикация без проверки) — текущая. Сбой записи публикацию не отменяет: следующая проверка
   * посмотрит больше, а не меньше.
   */
  async markPublished(
    tenantId: string,
    siteId: string,
    revisionId: string | null,
  ): Promise<void> {
    try {
      await this.db
        .update(schema.site)
        .set({
          publishedRevisionId:
            revisionId ?? sql`${schema.site.currentRevisionId}`,
        })
        .where(
          and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)),
        );
    } catch (error) {
      this.logger.warn(
        `published revision not saved for site ${siteId}: ${reasonOf(error)}`,
      );
    }
  }

  private async site(tenantId: string, siteId: string) {
    const [site] = await this.db
      .select()
      .from(schema.site)
      .where(
        and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)),
      );
    if (!site) throw new Error("site_not_found");
    return site;
  }

  private async scope(
    siteId: string,
    site: Parameters<typeof toStoreContentSite>[0],
    since: string | null,
    revisionId: string,
  ): Promise<{ scope: CheckScope | null; failed: CheckFailure[] }> {
    try {
      const scope = await this.content.checkScopeBetween(
        siteId,
        since,
        revisionId,
        {
          site: toStoreContentSite(site),
        },
      );
      return { scope, failed: [] };
    } catch (error) {
      this.logger.warn(
        `publish check scope failed for site ${siteId}: ${reasonOf(error)}`,
      );
      return {
        scope: null,
        failed: [
          {
            place: "browser",
            check: "look",
            reason: `что изменилось — не посчиталось: ${reasonOf(error)}`,
          },
        ],
      };
    }
  }

  /** Снимки целей по два разом, в пределах бюджета; лишние страницы и не успевшие — «не проверены». */
  private async lookAll(
    siteId: string,
    targets: LookTarget[],
  ): Promise<TakenFindings> {
    const taken: TakenFindings = { findings: [], failed: [] };
    const checked = targets.slice(0, MAX_LOOK_PAGES);
    const skipped = targets.slice(MAX_LOOK_PAGES).map((target) => target.page);
    if (skipped.length > 0) {
      taken.failed.push({
        place: "browser",
        check: "look",
        reason: `не проверены страницы (больше ${MAX_LOOK_PAGES} за раз): ${skipped.join(", ")}`,
      });
    }
    const started = this.clock();
    for (let at = 0; at < checked.length; at += LOOKS_AT_ONCE) {
      const left = PUBLISH_CHECK_BUDGET_MS - (this.clock() - started);
      const batch = checked.slice(at, at + LOOKS_AT_ONCE);
      if (left < 5_000) {
        const rest = checked.slice(at).map((target) => target.page);
        taken.failed.push({
          place: "browser",
          check: "look",
          reason: `не успели проверить страницы: ${rest.join(", ")}`,
        });
        break;
      }
      const results = await Promise.all(
        batch.map((target) =>
          this.lookOne(siteId, target, Math.min(PAGE_LOOK_WAIT_MS, left)),
        ),
      );
      for (const result of results) {
        taken.findings.push(...result.findings);
        taken.failed.push(...result.failed);
      }
    }
    return taken;
  }

  private async lookOne(
    siteId: string,
    target: LookTarget,
    waitMs: number,
  ): Promise<TakenFindings> {
    try {
      const outcome = await this.looks.look(
        { siteId, ...lookJobOf(target) },
        waitMs,
      );
      if (outcome.kind !== "snapshot")
        return { findings: [], failed: [lookFailure(target.page, outcome)] };
      return findingsOf(target, outcome.snapshot);
    } catch (error) {
      return {
        findings: [],
        failed: [
          {
            place: "browser",
            check: "look",
            reason: `${target.page}: ${reasonOf(error)}`,
          },
        ],
      };
    }
  }

  /** Товары в каталоге магазина (`product.findAll`, `shopId` = id магазина): ни одного — витрине нечего продавать. */
  private async catalog(siteId: string): Promise<TakenFindings> {
    try {
      const reply = await firstValueFrom(
        this.products
          .send<{
            success?: boolean;
            total?: unknown;
            data?: unknown;
          }>("product.findAll", { shopId: siteId, skip: 0, take: 1 })
          .pipe(timeout(PRODUCTS_TIMEOUT_MS)),
      );
      const total =
        typeof reply?.total === "number"
          ? reply.total
          : Array.isArray(reply?.data)
            ? reply.data.length
            : undefined;
      if (reply?.success === false || total === undefined) {
        return {
          findings: [],
          failed: [
            {
              place: "shop",
              check: "catalog",
              reason: "сервис товаров ответил не по форме",
            },
          ],
        };
      }
      return { findings: total === 0 ? [NO_PRODUCTS] : [], failed: [] };
    } catch (error) {
      return {
        findings: [],
        failed: [{ place: "shop", check: "catalog", reason: reasonOf(error) }],
      };
    }
  }
}

const NO_PRODUCTS: CheckFinding = {
  place: "shop",
  check: "catalog",
  rule: "no-products",
  level: "error",
  section: null,
  where: "каталог",
  text: "в магазине нет товаров · добавьте товары в разделе «Товары»",
  count: 1,
};
