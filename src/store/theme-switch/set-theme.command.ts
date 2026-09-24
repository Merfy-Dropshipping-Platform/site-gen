/**
 * Команда «сменить тему» — `SetTheme` (этап 3, кусок 3.3; И4, Н3, Н9).
 * RPC: `sites.cmd.set_theme`.
 *
 *   1. вход — по схеме (zod), отказ `invalid_input`;
 *   2. слаг темы — по каталогу: опечатка — `unknown_theme` со списком
 *      доступных (старый `update()` молча писал любой `themeId`);
 *   3. та же тема — эффект «без изменений», ничего не пересеивается;
 *   4. документ магазина — через порт `StoreContent.load`; новый документ —
 *      канон новой темы + свои страницы и меню мерчанта (`planThemeSwitch`,
 *      там же Н3 и Н9); запись — через `StoreContent.save` с CAS от
 *      прочитанной версии: чужая запись между чтением и записью —
 *      `revision_conflict`, тема магазина при этом не меняется;
 *   5. только после записи ревизии — `themeId` и дата выбора темы в строке
 *      магазина (раньше порядок был обратный: при сбое пересева магазин
 *      оставался с новой темой и старым содержимым);
 *   6. опубликованный магазин переиздаётся; статус — в ответе
 *      (`started` фоном, `done`/`failed` при `wait`).
 *
 * Ответ — эффект с отчётом: что перенесено, переименовано, приведено к
 * полной форме, пересеяно, убрано и потеряно.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { StoreContentService } from "../../content/store-content.service";
import type {
  StoreContent,
  StoreContentSite,
} from "../../content/store-content.port";
import { SitesEventsService } from "../../events/events.service";
import { SitesDomainService } from "../../sites.service";
import { ok, refused, type CommandResult } from "../commands/command-result";
import {
  THEME_CATALOG,
  hasStorefrontPackage,
  type ThemeCatalog,
} from "../theme-catalog";
import { presentCanonLikePort } from "./canon-reference";
import { planThemeSwitch, type ThemeSwitchReport } from "./theme-switch.plan";
import { BackgroundWork, within } from "../shared/background-work";
import { errorMessage } from "../shared/error-message";
import { issuesOf } from "../shared/input-issues";

export const SetThemeInputSchema = z.object({
  tenantId: z.string().trim().min(1),
  siteId: z.string().trim().min(1),
  themeId: z.string().trim().min(1),
  actorUserId: z.string().trim().min(1).optional(),
  /** Дождаться итога переиздания опубликованного магазина. */
  wait: z.boolean().default(false),
  waitTimeoutMs: z.number().int().min(1_000).max(300_000).default(120_000),
});
export type SetThemeInput = z.infer<typeof SetThemeInputSchema>;

export type RepublishStatus =
  | { status: "not_needed"; reason: "same_theme" | "not_published" }
  | { status: "started" }
  | { status: "done"; url: string | null; buildId: string | null }
  | { status: "failed"; error: string };

export interface SetThemeEffect {
  changed: boolean;
  siteId: string;
  fromThemeId: string | null;
  toThemeId: string;
  /** Текущая ревизия после команды. */
  revisionId: string | null;
  /** Ревизия, от которой команда строила новый документ. */
  previousRevisionId: string | null;
  report: ThemeSwitchReport | null;
  republish: RepublishStatus;
}

/** Строка магазина, как её отдаёт `SitesDomainService.get`. */
interface SiteRow {
  id: string;
  name: string | null;
  themeId: string | null;
  status: string | null;
  publicUrl: string | null;
  currentRevisionId: string | null;
  contentModel?: string | null;
}

/** Что команде нужно от sites-сервиса (реализует `SitesDomainService`). */
export interface ThemeSwitchSites {
  get(tenantId: string, siteId: string): Promise<SiteRow | null>;
  buildInitialRevision(
    themeId: string,
  ): Promise<Record<string, unknown> | null>;
  recordThemeChoice(params: {
    tenantId: string;
    siteId: string;
    themeId: string;
    actorUserId?: string;
  }): Promise<boolean>;
  publish(params: {
    tenantId: string;
    siteId: string;
    mode: "production";
  }): Promise<{ url?: string | null; buildId?: string | null }>;
}

function storeContentSite(site: SiteRow): StoreContentSite {
  return {
    themeId: site.themeId,
    publicUrl: site.publicUrl,
    name: site.name,
    currentRevisionId: site.currentRevisionId,
    contentModel: site.contentModel ?? null,
  };
}

@Injectable()
export class SetThemeCommand {
  private readonly logger = new Logger(SetThemeCommand.name);
  private readonly background = new BackgroundWork(
    this.logger,
    "theme-switch republish",
  );

  constructor(
    @Inject(SitesDomainService) private readonly sites: ThemeSwitchSites,
    @Inject(StoreContentService) private readonly content: StoreContent,
    @Inject(THEME_CATALOG) private readonly catalog: ThemeCatalog,
    @Inject(SitesEventsService)
    private readonly events: Pick<SitesEventsService, "emit">,
  ) {}

  async execute(raw: unknown): Promise<CommandResult<SetThemeEffect>> {
    const parsed = SetThemeInputSchema.safeParse(raw);
    if (!parsed.success) {
      return refused("invalid_input", {
        issues: issuesOf(parsed.error),
      });
    }
    const input = parsed.data;

    const theme = await this.catalog.find(input.themeId, input.tenantId);
    if (!theme) {
      const available = (await this.catalog.list(input.tenantId)).map(
        (t) => t.id,
      );
      return refused("unknown_theme", { themeId: input.themeId, available });
    }
    const site = await this.sites.get(input.tenantId, input.siteId);
    if (!site) return refused("site_not_found");
    if (site.themeId === theme.id) return ok(unchanged(site, theme.id));

    const canon = await this.sites.buildInitialRevision(theme.id);
    if (!canon)
      return refused("theme_canon_unavailable", { themeId: theme.id });
    const previous = site.currentRevisionId
      ? await this.content.load(site.id, { site: storeContentSite(site) })
      : null;
    const plan = planThemeSwitch({
      previous: previous?.document ?? null,
      canon,
      previousCanon: await this.previousCanon(site),
    });

    const revisionId = await this.write(
      site,
      input,
      theme.id,
      plan.document,
      previous?.version ?? null,
    );
    if (!revisionId) return refused("revision_conflict");

    await this.sites.recordThemeChoice({
      tenantId: input.tenantId,
      siteId: site.id,
      themeId: theme.id,
      actorUserId: input.actorUserId,
    });
    this.events.emit("sites.site.updated", {
      tenantId: input.tenantId,
      siteId: site.id,
      patch: { themeId: theme.id },
    });

    return ok({
      changed: true,
      siteId: site.id,
      fromThemeId: site.themeId,
      toThemeId: theme.id,
      revisionId,
      previousRevisionId: previous?.version ?? null,
      report: plan.report,
      republish: await this.republish(site, input),
    });
  }

  /** Дождаться фоновых переизданий, запущенных командой (тесты). */
  settle(): Promise<void> {
    return this.background.settle();
  }

  /** Канон прежней темы в виде порта; нет пакета темы — не с чем сравнивать. */
  private async previousCanon(
    site: SiteRow,
  ): Promise<Record<string, unknown> | null> {
    if (!site.themeId || !hasStorefrontPackage(site.themeId)) return null;
    const canon = await this.sites.buildInitialRevision(site.themeId);
    if (!canon) return null;
    return presentCanonLikePort(canon, site.themeId, site);
  }

  /** Новая ревизия через порт с CAS; `null` — чужая запись успела раньше. */
  private async write(
    site: SiteRow,
    input: SetThemeInput,
    toThemeId: string,
    document: Record<string, unknown>,
    expectedVersion: string | null,
  ): Promise<string | null> {
    try {
      const saved = await this.content.save(site.id, {
        document,
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        setCurrent: true,
        expectedVersion,
        meta: {
          title: "Theme switch",
          actor: "merchant",
          source: "theme-switch",
          fromThemeId: site.themeId,
          toThemeId,
        },
        site: storeContentSite(site),
      });
      return saved.version;
    } catch (e) {
      if (errorMessage(e) === "revision_conflict") return null;
      throw e;
    }
  }

  private async republish(
    site: SiteRow,
    input: SetThemeInput,
  ): Promise<RepublishStatus> {
    if (site.status !== "published")
      return { status: "not_needed", reason: "not_published" };
    const run = this.sites
      .publish({
        tenantId: input.tenantId,
        siteId: site.id,
        mode: "production",
      })
      .then(
        (res): RepublishStatus => ({
          status: "done",
          url: res?.url ?? null,
          buildId: res?.buildId ?? null,
        }),
        (e: unknown): RepublishStatus => ({
          status: "failed",
          error: errorMessage(e),
        }),
      )
      .then((status) => {
        this.logger.log(
          `theme-switch republish: site=${site.id} ${status.status}`,
        );
        return status;
      });
    const tracked = this.background.start(run);
    if (!input.wait) return STARTED;
    return (await within(tracked, input.waitTimeoutMs, STARTED)) ?? STARTED;
  }
}

const STARTED: RepublishStatus = { status: "started" };

function unchanged(site: SiteRow, themeId: string): SetThemeEffect {
  return {
    changed: false,
    siteId: site.id,
    fromThemeId: site.themeId,
    toThemeId: themeId,
    revisionId: site.currentRevisionId,
    previousRevisionId: site.currentRevisionId,
    report: null,
    republish: { status: "not_needed", reason: "same_theme" },
  };
}
