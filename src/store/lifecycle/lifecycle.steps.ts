/**
 * Шаги саги рождения магазина (этап 3, кусок 3.1).
 *
 *   seed      — стартовая ревизия ВЫБРАННОЙ темы через порт StoreContent
 *               (одна ревизия, без пересева: И1);
 *   provision — поддомен REG.RU (domain-сервис) + проект тенанта в Coolify —
 *               существующий идемпотентный `finishProvisioning`;
 *   route     — маршрут хостинга: роутер центрального прокси или per-site app
 *               (то, что для старых магазинов делал reaper, — общий код
 *               `ensureSiteHosting`).
 *
 * Шаг идемпотентен (выполненное не повторяет) и о провале говорит исключением
 * с причиной — её доводчик кладёт в `lifecycle_error`.
 */
import { Inject, Injectable } from "@nestjs/common";
import { StoreContentService } from "../../content/store-content.service";
import {
  RevisionConflictError,
  type StoreContent,
} from "../../content/store-content.port";
import { SitesDomainService } from "../../sites.service";
import {
  ORGANIZATION_DIRECTORY,
  type OrganizationDirectory,
} from "../../user/organization-directory.client";
import { hasStorefrontPackage } from "../theme-catalog";
import type { LifecycleRow } from "./lifecycle.repository";
import type { LifecycleStepRunner } from "./store-lifecycle.reconciler";

/** То, что шагам нужно от sites-сервиса (реализует `SitesDomainService`). */
export interface StoreProvisioning {
  buildInitialRevision(
    themeId: string,
  ): Promise<Record<string, unknown> | null>;
  finishProvisioning(
    siteId: string,
    tenantId: string,
    companyName?: string,
  ): Promise<{
    publicUrl: string | undefined;
    failures?: Partial<Record<"domain" | "project", string>>;
  }>;
  ensureSiteHosting(
    siteId: string,
  ): Promise<{ coolifyAppUuid: string | null; error?: string }>;
  /** Маршрут хостинга — центральный прокси (проект тенанта в Coolify ему не нужен). */
  usesCentralProxy(): boolean;
}

type ProvisioningPart = "domain" | "project";

@Injectable()
export class StoreLifecycleSteps implements LifecycleStepRunner {
  constructor(
    @Inject(SitesDomainService) private readonly sites: StoreProvisioning,
    @Inject(StoreContentService) private readonly content: StoreContent,
    @Inject(ORGANIZATION_DIRECTORY)
    private readonly organizations: OrganizationDirectory,
  ) {}

  async seed(row: LifecycleRow): Promise<void> {
    if (row.currentRevisionId) return;
    // Без пакета темы `buildInitialRevision` молча отдал бы легаси-сид rose —
    // магазин родился бы не на той теме. Команда пускает только темы каталога,
    // так что это провал данных: пусть будет виден в `lifecycle_error`.
    const themeId = row.themeId;
    if (!themeId || !hasStorefrontPackage(themeId)) {
      throw new Error(`theme "${themeId ?? ""}" has no storefront package`);
    }
    const document = await this.sites.buildInitialRevision(themeId);
    if (!document) throw new Error(`no starter content for theme "${themeId}"`);
    try {
      await this.content.save(row.id, {
        mode: "blind",
        document,
        tenantId: row.tenantId,
        actor: "system",
        source: "seed",
        meta: { title: row.name },
        actorUserId: row.createdBy ?? undefined,
        setCurrent: true,
        // CAS «ревизии ещё нет»: два сида одной строки не дадут двух текущих ревизий.
        expectedVersion: null,
        site: {
          themeId: row.themeId,
          publicUrl: row.publicUrl,
          name: row.name,
          currentRevisionId: null,
          contentModel: row.contentModel,
        },
      });
    } catch (e) {
      // Кто-то уже засеял магазин (второй проход, гонка) — требование выполнено.
      if (e instanceof RevisionConflictError) return;
      throw e;
    }
  }

  async provision(row: LifecycleRow): Promise<void> {
    // Имя компании — метка проекта тенанта в Coolify. Решение плана: sites
    // спрашивает user-сервис (как раньше делал шлюз), нет ответа — имя магазина
    // (как делал старый reaper).
    const companyName =
      (await this.organizations.nameOf(row.tenantId)) ?? row.name;
    const result = await this.sites.finishProvisioning(
      row.id,
      row.tenantId,
      companyName,
    );
    const required: Record<ProvisioningPart, boolean> = {
      domain: true,
      project: this.projectRequired(),
    };
    const failures = Object.entries(result.failures ?? {})
      .filter(([part]) => required[part as ProvisioningPart])
      .map(([part, reason]) => `${part}: ${reason}`);
    if (failures.length) throw new Error(failures.join("; "));
  }

  /**
   * Проект тенанта в Coolify нужен только приложению на магазин. При
   * центральном прокси маршрут обходится без него, и сбой проекта (dev без
   * доступа к API Coolify) не останавливает сагу — старый путь регистрации
   * тоже лишь пишет его в лог. То же правило читает доводчик в фактах саги.
   */
  projectRequired(): boolean {
    return !this.sites.usesCentralProxy();
  }

  async route(row: LifecycleRow): Promise<void> {
    const result = await this.sites.ensureSiteHosting(row.id);
    if (result.error) throw new Error(result.error);
  }
}
